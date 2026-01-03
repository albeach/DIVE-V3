#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Spoke Keycloak Initialization
# =============================================================================
# Creates realm, client, scopes, and test users in Keycloak
# Usage: ./init-keycloak.sh <INSTANCE_CODE> [KEYCLOAK_URL] [ADMIN_PASSWORD]
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
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
CLIENT_ID="dive-v3-broker-${CODE_LOWER}"

# Load configuration from .env (safely - ignore lines with errors)
INSTANCE_DIR="instances/${CODE_LOWER}"
if [[ -f "${INSTANCE_DIR}/.env" ]]; then
    # CRITICAL: Source .env safely - filter out any corrupted lines
    # This prevents ANSI codes or error messages in .env from crashing the script
    while IFS= read -r line || [[ -n "$line" ]]; do
        # Skip empty lines and comments
        [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
        # Skip lines that don't look like valid KEY=value
        [[ ! "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]] && continue
        # Export the variable
        export "$line" 2>/dev/null || true
    done < "${INSTANCE_DIR}/.env"
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

# Use backend container for API calls (has curl, on same network)
# New naming pattern: dive-spoke-lva-backend (not lva-backend-lva-1)
PROJECT_PREFIX="${COMPOSE_PROJECT_NAME:-dive-spoke-${CODE_LOWER}}"
API_CONTAINER="dive-spoke-${CODE_LOWER}-backend"
KC_CONTAINER="dive-spoke-${CODE_LOWER}-keycloak"

# FIXED (Dec 2025): ALWAYS prefer container password - it's authoritative
# The .env file can become stale after container restart/redeploy
# Priority: 1) Container env var, 2) Instance-specific env var, 3) Generic env var
ADMIN_PASSWORD=""
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${KC_CONTAINER}$"; then
    # Try KC_BOOTSTRAP_ADMIN_PASSWORD first (modern Keycloak), then KEYCLOAK_ADMIN_PASSWORD (legacy)
    ADMIN_PASSWORD=$(docker exec "$KC_CONTAINER" printenv KC_BOOTSTRAP_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')
    if [ -z "$ADMIN_PASSWORD" ]; then
        ADMIN_PASSWORD=$(docker exec "$KC_CONTAINER" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')
    fi
    if [ -n "$ADMIN_PASSWORD" ] && [ ${#ADMIN_PASSWORD} -gt 10 ]; then
        log_info "Using Keycloak password from container (authoritative)"
    else
        ADMIN_PASSWORD=""
    fi
fi

# Fallback to environment variables if container password not available
if [ -z "$ADMIN_PASSWORD" ]; then
    INSTANCE_PASSWORD_VAR="KEYCLOAK_ADMIN_PASSWORD_${CODE_UPPER}"
    ADMIN_PASSWORD="${!INSTANCE_PASSWORD_VAR:-${KEYCLOAK_ADMIN_PASSWORD:-admin}}"
    log_warn "Container password not available, using env var fallback"
fi

# Internal URL for API calls (via Docker network using Keycloak container name)
KEYCLOAK_INTERNAL_URL="https://dive-spoke-${CODE_LOWER}-keycloak:8443"
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

# CRITICAL FIX: Read client secret from spoke's .env file to ensure consistency
# The frontend uses AUTH_KEYCLOAK_SECRET which MUST match what Keycloak has
INSTANCE_ENV_FILE="${PROJECT_ROOT}/instances/${CODE_LOWER}/.env"
if [ -f "$INSTANCE_ENV_FILE" ]; then
    SPOKE_CLIENT_SECRET=$(grep '^AUTH_KEYCLOAK_SECRET=' "$INSTANCE_ENV_FILE" 2>/dev/null | cut -d'=' -f2 | tr -d '\n\r"')
    if [ -n "$SPOKE_CLIENT_SECRET" ]; then
        CLIENT_SECRET="$SPOKE_CLIENT_SECRET"
        log_info "Using client secret from spoke .env file (AUTH_KEYCLOAK_SECRET)"
    else
        CLIENT_SECRET="${KEYCLOAK_CLIENT_SECRET:-$(openssl rand -hex 32)}"
        log_warn "AUTH_KEYCLOAK_SECRET not found in .env, generating new secret"
    fi
else
    CLIENT_SECRET="${KEYCLOAK_CLIENT_SECRET:-$(openssl rand -hex 32)}"
    log_warn "Spoke .env file not found, generating new client secret"
fi
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
# Determine Theme FIRST (needed for realm creation)
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
# Ensure Realm Exists (with retry logic for resilience)
# =============================================================================
# ADDED (Dec 2025): Pre-verification with retry to ensure realm exists
# before any client/user operations are attempted
# FIXED (Jan 2026): Now includes theme settings when creating realm
ensure_realm_exists() {
    local realm_name="$1"
    local max_attempts=5
    local delay=3
    local attempt=1

    log_step "Ensuring realm exists: $realm_name (with retry)..."

    while [ $attempt -le $max_attempts ]; do
        # Check if realm exists
        local realm_check=$(kc_curl -H "Authorization: Bearer $TOKEN" \
            "${KEYCLOAK_INTERNAL_URL}/admin/realms/${realm_name}" 2>/dev/null | jq -r '.realm // empty')

        if [[ -n "$realm_check" ]]; then
            log_success "Realm $realm_name verified (attempt $attempt)"
            # CRITICAL: Ensure theme is applied even if realm already exists
            log_info "Applying theme and frontendUrl to existing realm..."
            kc_curl -X PUT "${KEYCLOAK_INTERNAL_URL}/admin/realms/${realm_name}" \
                -H "Authorization: Bearer $TOKEN" \
                -H "Content-Type: application/json" \
                -d "{
                    \"displayName\": \"${REALM_DISPLAY_NAME}\",
                    \"loginTheme\": \"${THEME_NAME}\",
                    \"accountTheme\": \"${THEME_NAME}\",
                    \"adminTheme\": \"keycloak.v2\",
                    \"emailTheme\": \"keycloak\",
                    \"internationalizationEnabled\": true,
                    \"supportedLocales\": [\"en\"],
                    \"defaultLocale\": \"en\",
                    \"attributes\": {
                        \"frontendUrl\": \"${PUBLIC_KEYCLOAK_URL}\"
                    }
                }" 2>/dev/null && log_success "Theme applied: ${THEME_NAME}"
            return 0
        fi

        log_warn "Realm $realm_name not found (attempt $attempt/$max_attempts), creating..."

        # Create realm with FULL config including theme
        local create_result=$(kc_curl -X POST "${KEYCLOAK_INTERNAL_URL}/admin/realms" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -w "%{http_code}" \
            -o /dev/null \
            -d "{
                \"realm\": \"$realm_name\",
                \"enabled\": true,
                \"displayName\": \"${REALM_DISPLAY_NAME}\",
                \"loginTheme\": \"${THEME_NAME}\",
                \"accountTheme\": \"${THEME_NAME}\",
                \"adminTheme\": \"keycloak.v2\",
                \"emailTheme\": \"keycloak\",
                \"internationalizationEnabled\": true,
                \"supportedLocales\": [\"en\"],
                \"defaultLocale\": \"en\",
                \"sslRequired\": \"none\",
                \"registrationAllowed\": false,
                \"loginWithEmailAllowed\": true,
                \"duplicateEmailsAllowed\": false,
                \"resetPasswordAllowed\": true,
                \"editUsernameAllowed\": false,
                \"bruteForceProtected\": true,
                \"attributes\": {
                    \"frontendUrl\": \"${PUBLIC_KEYCLOAK_URL}\"
                }
            }" 2>/dev/null)

        if [[ "$create_result" == "201" || "$create_result" == "409" ]]; then
            log_success "Realm $realm_name created with theme: ${THEME_NAME}"
            return 0
        fi

        if [ $attempt -lt $max_attempts ]; then
            log_warn "Realm creation returned HTTP $create_result, retrying in ${delay}s..."
            sleep $delay
            delay=$((delay * 2))
        fi
        attempt=$((attempt + 1))
    done

    log_error "Failed to ensure realm $realm_name exists after $max_attempts attempts"
    return 1
}

# =============================================================================
# TERRAFORM SSOT - Apply Keycloak Configuration
# =============================================================================
# Terraform is now the Single Source of Truth (SSOT) for Keycloak configuration.
#
# IMPORTANT: When USE_TERRAFORM_SSOT=true, Terraform creates the realm, clients,
# and protocol mappers. The ensure_realm_exists function only runs AFTER Terraform
# to apply theme settings and verify the realm was created successfully.
# It creates: realm, client, protocol mappers, WebAuthn policy, ACR-LoA mapping.
#
# The shell script handles ONLY dynamic operations:
#   - USA Hub IdP creation (cross-instance references)
#   - User profile initialization (backend script)
#   - User seeding (needs runtime credentials)
#   - NextAuth DB initialization
#
# =============================================================================
# TERRAFORM SSOT MODE (Best Practice)
# =============================================================================
# Set USE_TERRAFORM_SSOT=false to use legacy API calls (NOT RECOMMENDED)
# Set STRICT_TERRAFORM_SSOT=true to fail if Terraform fails (default for best practice)
# =============================================================================
USE_TERRAFORM_SSOT="${USE_TERRAFORM_SSOT:-true}"
STRICT_TERRAFORM_SSOT="${STRICT_TERRAFORM_SSOT:-true}"
TERRAFORM_APPLIED=false

if [[ "$USE_TERRAFORM_SSOT" == "true" ]]; then
    log_step "Applying Keycloak configuration via Terraform (SSOT)..."

    # Source the terraform wrapper module
    if [[ -f "${PROJECT_ROOT}/scripts/dive-modules/terraform-apply.sh" ]]; then
        source "${PROJECT_ROOT}/scripts/dive-modules/terraform-apply.sh"

        # Export required environment variables for Terraform
        export KEYCLOAK_ADMIN_PASSWORD="$ADMIN_PASSWORD"
        export KEYCLOAK_CLIENT_SECRET="$CLIENT_SECRET"
        export TF_VAR_test_user_password="$ADMIN_PASSWORD"
        export TF_VAR_client_secret="$CLIENT_SECRET"
        export TF_VAR_webauthn_rp_id="localhost"
        export TF_VAR_local_keycloak_port="$local_kc_port"
        export TF_VAR_local_frontend_port="$LOCAL_FRONTEND_PORT"

        # Apply Terraform (creates realm, client, mappers, WebAuthn, ACR-LoA)
        if spoke_terraform_apply "$CODE_UPPER"; then
            log_success "Terraform applied - realm, client, mappers configured"
            TERRAFORM_APPLIED=true

            # After Terraform creates realm, apply theme settings (Terraform doesn't manage themes well)
            log_info "Applying theme settings to Terraform-created realm..."
            ensure_realm_exists "$REALM_NAME"
        else
            if [[ "$STRICT_TERRAFORM_SSOT" == "true" ]]; then
                log_error "Terraform apply failed and STRICT_TERRAFORM_SSOT is enabled"
                log_error "Fix the Terraform configuration or set STRICT_TERRAFORM_SSOT=false"
                exit 1
            else
                log_warn "Terraform apply failed, falling back to legacy API calls (NOT RECOMMENDED)"
            fi
        fi
    else
        if [[ "$STRICT_TERRAFORM_SSOT" == "true" ]]; then
            log_error "Terraform wrapper not found at ${PROJECT_ROOT}/scripts/dive-modules/terraform-apply.sh"
            log_error "STRICT_TERRAFORM_SSOT is enabled - cannot continue without Terraform"
            exit 1
        else
            log_warn "Terraform wrapper not found, using legacy API calls (NOT RECOMMENDED)"
        fi
    fi
fi

# Verify realm exists (either from Terraform or legacy)
if [[ "$TERRAFORM_APPLIED" != "true" ]]; then
    # Legacy mode needs to create the realm first
    if ! ensure_realm_exists "$REALM_NAME"; then
        log_error "Cannot proceed without realm. Exiting."
        exit 1
    fi
fi

# =============================================================================
# LEGACY: Create Realm (if Terraform not used or failed)
# =============================================================================
# This section is DEPRECATED and will be removed in a future version.
# It only runs if Terraform is disabled or failed.
# =============================================================================
if [[ "$TERRAFORM_APPLIED" != "true" ]]; then
    log_step "Creating realm: ${REALM_NAME} (legacy mode)..."

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
# Disable Review Profile in First Broker Login Flow (Best Practice for Federation)
# =============================================================================
# CRITICAL: For trusted federation, the "Review Profile" step should be DISABLED
# because:
# 1. The federated IdP (Hub or other Spoke) is trusted
# 2. User attributes are imported from the federated token
# 3. Profile verification adds unnecessary friction and breaks seamless SSO
#
# Best Practice: Disable Review Profile for all trusted federation scenarios
# =============================================================================
log_step "Disabling Review Profile in First Broker Login flow..."

# Get the Review Profile execution details
REVIEW_PROFILE_EXEC=$(kc_curl -s -H "Authorization: Bearer $TOKEN" \
    "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/authentication/flows/first%20broker%20login/executions" 2>/dev/null | \
    jq '.[] | select(.providerId == "idp-review-profile")')

if [[ -n "$REVIEW_PROFILE_EXEC" ]]; then
    CURRENT_REQ=$(echo "$REVIEW_PROFILE_EXEC" | jq -r '.requirement')

    if [[ "$CURRENT_REQ" != "DISABLED" ]]; then
        # Update the execution to DISABLED
        UPDATE_PAYLOAD=$(echo "$REVIEW_PROFILE_EXEC" | jq '.requirement = "DISABLED"')

        HTTP_STATUS=$(kc_curl -s -X PUT \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/authentication/flows/first%20broker%20login/executions" \
            -d "$UPDATE_PAYLOAD" -w "%{http_code}" -o /dev/null 2>/dev/null)

        if [[ "$HTTP_STATUS" == "204" ]]; then
            log_success "Review Profile disabled in First Broker Login flow"
        else
            log_warn "Failed to disable Review Profile (HTTP $HTTP_STATUS)"
        fi
    else
        log_info "Review Profile already DISABLED"
    fi
else
    log_warn "Could not find Review Profile execution (may already be configured)"
fi

# =============================================================================
# Initialize User Profile (Multi-Valued COI Support)
# =============================================================================
log_step "Initializing User Profile with multi-valued attributes..."

# Call the TypeScript init script from backend
BACKEND_CONTAINER="dive-spoke-${CODE_LOWER}-backend"
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
                \"http://localhost:3000/api/auth/callback/keycloak\",
                \"https://localhost:*/*\",
                \"*\"
            ],
            \"webOrigins\": [
                \"${FRONTEND_URL}\",
                \"${LOCALHOST_FALLBACK}\",
                \"https://localhost:3000\",
                \"http://localhost:3000\",
                \"*\"
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
# ⚠️ REMOVED: Cross-Border Federation Client (v5.0)
# =============================================================================
# REMOVED as of Jan 2, 2026
#
# This dive-v3-cross-border-client was never used for actual federation.
# Federation uses dive-v3-broker-{code} pattern exclusively:
#   - Hub→Spoke: Hub uses dive-v3-broker-usa client ON the spoke
#   - Spoke→Hub: Spoke uses dive-v3-broker-{spoke_code} client ON the hub
#
# The old cross-border-client code has been removed to avoid confusion.
# See: HANDOFF_ACR_AMR_COMPLETE_FIX.md for details.
# =============================================================================
log_info "Skipping deprecated cross-border-client (removed in v5.0)"

fi  # End of TERRAFORM_APPLIED != true block (realm, client, mappers, cross-border)

# =============================================================================
# Ensure USA Hub Identity Provider (so spoke can federate to hub)
# =============================================================================
# NOTE: This section ALWAYS runs (not managed by Terraform)
# It creates a dynamic IdP reference from this spoke to the USA Hub.
# =============================================================================
log_step "Ensuring USA hub IdP (usa-idp) is configured..."

USA_IDP_ALIAS="usa-idp"
USA_IDP_DISPLAY="United States"
HUB_IDP_PUBLIC_URL="${HUB_IDP_URL:-https://localhost:8443}"
# For Docker internal communication, use dive-hub-keycloak:8443 (HTTPS) by default
HUB_IDP_INTERNAL_URL="${HUB_IDP_INTERNAL_URL:-https://dive-hub-keycloak:8443}"
HUB_IDP_DISABLE_TRUST="${HUB_IDP_DISABLE_TRUST:-true}"
# Use the spoke-specific client on Hub (must exist in USA Keycloak's dive-v3-broker realm)
# Format: dive-v3-client-<spoke_code> (e.g., dive-v3-client-lva for Latvia)
USA_IDP_CLIENT_ID="${USA_IDP_CLIENT_ID:-dive-v3-broker-${CODE_LOWER}}"
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
        \"firstBrokerLoginFlowAlias\": \"\",
        \"config\": {
            \"clientId\": \"${USA_IDP_CLIENT_ID}\",
            \"clientSecret\": \"${USA_IDP_CLIENT_SECRET}\",
            \"defaultScope\": \"openid profile email\",
            \"authorizationUrl\": \"${HUB_IDP_PUBLIC_URL}/realms/dive-v3-broker-usa/protocol/openid-connect/auth\",
            \"tokenUrl\": \"${HUB_IDP_INTERNAL_URL}/realms/dive-v3-broker-usa/protocol/openid-connect/token\",
            \"logoutUrl\": \"${HUB_IDP_PUBLIC_URL}/realms/dive-v3-broker-usa/protocol/openid-connect/logout\",
            \"userInfoUrl\": \"${HUB_IDP_INTERNAL_URL}/realms/dive-v3-broker-usa/protocol/openid-connect/userinfo\",
            \"issuer\": \"${HUB_IDP_PUBLIC_URL}/realms/dive-v3-broker-usa\",
            \"jwksUrl\": \"${HUB_IDP_INTERNAL_URL}/realms/dive-v3-broker-usa/protocol/openid-connect/certs\",
            \"validateSignature\": \"true\",
            \"useJwksUrl\": \"true\",
            \"backchannelSupported\": \"true\",
            \"syncMode\": \"FORCE\",
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

    # =============================================================================
    # Create IdP Mappers for usa-idp (CRITICAL for authorization flow)
    # =============================================================================
    log_step "Creating IdP claim mappers for ${USA_IDP_ALIAS}..."

    # Source resilient mapper utilities
    if [ -f "${PROJECT_ROOT}/scripts/dive-modules/keycloak-mappers.sh" ]; then
        source "${PROJECT_ROOT}/scripts/dive-modules/keycloak-mappers.sh"
    fi

    # Create mappers for clearance, countryOfAffiliation, uniqueID, acpCOI
    for attr in clearance countryOfAffiliation uniqueID acpCOI; do
        MAPPER_PAYLOAD="{
            \"name\": \"${attr}-mapper\",
            \"identityProviderMapper\": \"oidc-user-attribute-idp-mapper\",
            \"identityProviderAlias\": \"${USA_IDP_ALIAS}\",
            \"config\": {
                \"syncMode\": \"FORCE\",
                \"claim\": \"${attr}\",
                \"user.attribute\": \"${attr}\"
            }
        }"

        # Check if mapper exists by ID (not just name)
        EXISTING_MAPPER_ID=$(kc_curl -H "Authorization: Bearer $TOKEN" \
            "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/identity-provider/instances/${USA_IDP_ALIAS}/mappers" 2>/dev/null | \
            jq -r --arg name "${attr}-mapper" '.[] | select(.name==$name) | .id // empty')

        if [[ -n "$EXISTING_MAPPER_ID" ]]; then
            # Update existing mapper using its ID
            kc_curl -X PUT "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/identity-provider/instances/${USA_IDP_ALIAS}/mappers/${EXISTING_MAPPER_ID}" \
                -H "Authorization: Bearer $TOKEN" \
                -H "Content-Type: application/json" \
                -d "${MAPPER_PAYLOAD}" >/dev/null 2>&1 || log_warn "Failed to update ${attr}-mapper (non-blocking)"
        else
            # Create new mapper
            kc_curl -X POST "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/identity-provider/instances/${USA_IDP_ALIAS}/mappers" \
                -H "Authorization: Bearer $TOKEN" \
                -H "Content-Type: application/json" \
                -d "${MAPPER_PAYLOAD}" >/dev/null 2>&1 || log_warn "Failed to create ${attr}-mapper (non-blocking)"
        fi
    done
    log_success "Created IdP claim mappers for ${USA_IDP_ALIAS}"
fi

# =============================================================================
# AUTO-APPLY USER PROFILE TEMPLATE (Phase 2 - GAP-001)
# =============================================================================
log_step "Applying locale-specific user profile template..."

SCRIPT_DIR_INIT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Apply user profile template for this nation (non-blocking)
if [[ -x "${SCRIPT_DIR_INIT}/apply-user-profile.sh" ]]; then
    # Export Keycloak credentials for the script
    export KEYCLOAK_ADMIN_PASSWORD="${ADMIN_PASSWORD}"
    "${SCRIPT_DIR_INIT}/apply-user-profile.sh" "${CODE_UPPER}" 2>/dev/null || {
        log_warn "User profile template application skipped (may already be applied)"
    }
else
    log_warn "apply-user-profile.sh not found or not executable"
    log_info "Run manually: ./scripts/spoke-init/apply-user-profile.sh ${CODE_UPPER}"
fi

# =============================================================================
# DISABLE PROFILE REQUIRED ACTIONS (ACP-240 PII MINIMIZATION)
# =============================================================================
# ACP-240 requires PII minimization. DIVE V3 uses pseudonymous identities.
# VERIFY_PROFILE and UPDATE_PROFILE required actions should be DISABLED to
# prevent Keycloak from asking users for firstName, lastName, email.
# =============================================================================
log_step "Disabling VERIFY_PROFILE and UPDATE_PROFILE required actions (ACP-240)..."

# Disable VERIFY_PROFILE
kc_curl -X PUT "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/authentication/required-actions/VERIFY_PROFILE" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "alias": "VERIFY_PROFILE",
        "name": "Verify Profile",
        "providerId": "VERIFY_PROFILE",
        "enabled": false,
        "defaultAction": false,
        "priority": 90
    }' 2>/dev/null && log_success "VERIFY_PROFILE disabled" || log_warn "VERIFY_PROFILE already disabled"

# Disable UPDATE_PROFILE
kc_curl -X PUT "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/authentication/required-actions/UPDATE_PROFILE" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "alias": "UPDATE_PROFILE",
        "name": "Update Profile",
        "providerId": "UPDATE_PROFILE",
        "enabled": false,
        "defaultAction": false,
        "priority": 40
    }' 2>/dev/null && log_success "UPDATE_PROFILE disabled" || log_warn "UPDATE_PROFILE already disabled"

# =============================================================================
# AUTO-CONFIGURE LOCALIZED MAPPERS (Phase 2 - GAP-001)
# =============================================================================
# Only apply localized mappers for non-USA spokes (USA uses standard English attributes)
if [[ "${CODE_UPPER}" != "USA" ]]; then
    log_step "Configuring localized attribute mappers..."

    if [[ -x "${SCRIPT_DIR_INIT}/configure-localized-mappers.sh" ]]; then
        export KEYCLOAK_ADMIN_PASSWORD="${ADMIN_PASSWORD}"
        "${SCRIPT_DIR_INIT}/configure-localized-mappers.sh" "${CODE_UPPER}" 2>/dev/null || {
            log_warn "Localized mappers configuration skipped (may already be configured)"
        }
    else
        log_warn "configure-localized-mappers.sh not found or not executable"
        log_info "Run manually: ./scripts/spoke-init/configure-localized-mappers.sh ${CODE_UPPER}"
    fi
fi

# =============================================================================
# LEGACY: WebAuthn, ACR-LoA, AMR/ACR Configuration
# =============================================================================
# These are now managed by Terraform (SSOT). This section only runs if
# Terraform was not applied (fallback mode).
# =============================================================================
if [[ "$TERRAFORM_APPLIED" != "true" ]]; then

# =============================================================================
# Configure WebAuthn Policy (Best Practice: Spoke Handles MFA)
# =============================================================================
# CRITICAL: This sets the WebAuthn Relying Party ID to match the browser origin
# Without this, passkey registration fails with "Type error" because the RP ID
# doesn't match the domain in navigator.credentials.create()
#
# Best Practice: Spoke handles MFA, Hub trusts spoke's authentication
# - Spoke enforces WebAuthn for TOP_SECRET, OTP for SECRET/CONFIDENTIAL
# - Hub does NOT enforce post-broker MFA (trusts spoke's AMR/ACR claims)
# =============================================================================
log_step "Configuring WebAuthn policy for localhost..."

WEBAUTHN_POLICY_UPDATE=$(cat <<EOF
{
    "webAuthnPolicyRpEntityName": "DIVE V3 - ${CODE_UPPER}",
    "webAuthnPolicyRpId": "localhost",
    "webAuthnPolicySignatureAlgorithms": ["ES256", "RS256"],
    "webAuthnPolicyAttestationConveyancePreference": "none",
    "webAuthnPolicyAuthenticatorAttachment": "not specified",
    "webAuthnPolicyRequireResidentKey": "not specified",
    "webAuthnPolicyUserVerificationRequirement": "preferred",
    "webAuthnPolicyCreateTimeout": 60,
    "webAuthnPolicyAvoidSameAuthenticatorRegister": false,
    "webAuthnPolicyPasswordlessRpEntityName": "DIVE V3 - ${CODE_UPPER}",
    "webAuthnPolicyPasswordlessRpId": "localhost",
    "webAuthnPolicyPasswordlessSignatureAlgorithms": ["ES256", "RS256"],
    "webAuthnPolicyPasswordlessAttestationConveyancePreference": "none",
    "webAuthnPolicyPasswordlessAuthenticatorAttachment": "not specified",
    "webAuthnPolicyPasswordlessRequireResidentKey": "Yes",
    "webAuthnPolicyPasswordlessUserVerificationRequirement": "required",
    "webAuthnPolicyPasswordlessCreateTimeout": 120
}
EOF
)

kc_curl -X PUT "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$WEBAUTHN_POLICY_UPDATE" 2>/dev/null

if [ $? -eq 0 ]; then
    log_success "WebAuthn policy configured: rpId=localhost"
else
    log_warn "WebAuthn policy configuration failed (non-blocking)"
fi

# =============================================================================
# Configure ACR-LoA Mapping (Required for AAL enforcement)
# =============================================================================
# Maps ACR values to numeric Levels of Assurance for conditional MFA
# AAL1 = Password only, AAL2 = OTP, AAL3 = WebAuthn
# =============================================================================
log_step "Configuring ACR-LoA mapping..."

ACR_LOA_UPDATE=$(cat <<EOF
{
    "attributes": {
        "frontendUrl": "${PUBLIC_KEYCLOAK_URL}",
        "acr.loa.map": "{\"1\":1,\"2\":2,\"3\":3}"
    }
}
EOF
)

kc_curl -X PUT "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$ACR_LOA_UPDATE" 2>/dev/null

if [ $? -eq 0 ]; then
    log_success "ACR-LoA mapping configured"
else
    log_warn "ACR-LoA mapping configuration failed (non-blocking)"
fi

# =============================================================================
# Add AMR/ACR Protocol Mappers to Client
# =============================================================================
# These mappers ensure AMR/ACR claims are included in tokens issued by this spoke
# Required for Hub to receive authentication method information from spoke
#
# CRITICAL (Jan 2, 2026): Must use oidc-usermodel-attribute-mapper for AMR!
# Session-based oidc-amr-mapper does NOT work for federated users.
# AMR is stored in user.attribute.amr, so we read from there.
# jsonType.label MUST be "String" (not "JSON") for multivalued arrays.
# See: HANDOFF_ACR_AMR_COMPLETE_FIX.md and docs/ACR_AMR_MAINTENANCE.md
# =============================================================================
log_step "Adding AMR/ACR protocol mappers to client..."

# AMR mapper - MUST use user-attribute mapper (not session-based)
# For federated users, AMR is stored in user.attribute.amr
AMR_MAPPER_PAYLOAD=$(cat <<EOF
{
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
        "jsonType.label": "String",
        "multivalued": "true"
    }
}
EOF
)

# Check if ANY AMR mapper exists (old or new style)
EXISTING_AMR_MAPPER=$(kc_curl -H "Authorization: Bearer $TOKEN" \
    "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}/protocol-mappers/models" 2>/dev/null | \
    jq -r '.[] | select(.name | contains("amr")) | .id // empty' | head -1)

if [[ -n "$EXISTING_AMR_MAPPER" ]]; then
    # Delete old mapper first (might be wrong type)
    kc_curl -X DELETE "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}/protocol-mappers/models/${EXISTING_AMR_MAPPER}" \
        -H "Authorization: Bearer $TOKEN" 2>/dev/null || true
    log_info "Removed old AMR mapper"
fi

# Create new correct mapper
kc_curl -X POST "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}/protocol-mappers/models" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$AMR_MAPPER_PAYLOAD" 2>/dev/null
log_success "Created AMR mapper (user-attribute, jsonType=String)"

# ACR mapper
ACR_MAPPER_PAYLOAD=$(cat <<EOF
{
    "name": "acr (authn context)",
    "protocol": "openid-connect",
    "protocolMapper": "oidc-acr-mapper",
    "consentRequired": false,
    "config": {
        "id.token.claim": "true",
        "access.token.claim": "true",
        "userinfo.token.claim": "true",
        "claim.name": "acr"
    }
}
EOF
)

# Check if ACR mapper exists
EXISTING_ACR_MAPPER=$(kc_curl -H "Authorization: Bearer $TOKEN" \
    "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}/protocol-mappers/models" 2>/dev/null | \
    jq -r '.[] | select(.name | contains("acr")) | .id // empty' | head -1)

if [[ -n "$EXISTING_ACR_MAPPER" ]]; then
    # Update existing
    kc_curl -X PUT "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}/protocol-mappers/models/${EXISTING_ACR_MAPPER}" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "$ACR_MAPPER_PAYLOAD" 2>/dev/null
    log_info "Updated ACR mapper"
else
    # Create new
    kc_curl -X POST "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}/protocol-mappers/models" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "$ACR_MAPPER_PAYLOAD" 2>/dev/null
    log_success "Created ACR mapper (authn context)"
fi

# Also add AMR/ACR mappers to the cross-border client (for federation)
if [[ -n "$CB_CLIENT_UUID" ]]; then
    log_step "Adding AMR/ACR mappers to cross-border federation client..."

    # AMR mapper for federation client
    kc_curl -X POST "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/clients/${CB_CLIENT_UUID}/protocol-mappers/models" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "$AMR_MAPPER_PAYLOAD" 2>/dev/null || true

    # ACR mapper for federation client
    kc_curl -X POST "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/clients/${CB_CLIENT_UUID}/protocol-mappers/models" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "$ACR_MAPPER_PAYLOAD" 2>/dev/null || true

    log_success "AMR/ACR mappers added to cross-border client"
fi

fi  # End of TERRAFORM_APPLIED != true block (WebAuthn, ACR-LoA, AMR/ACR)

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

# =============================================================================
# RESOURCE SEEDING REMOVED FROM init-keycloak.sh
# =============================================================================
# ⚠️  CRITICAL: Resource seeding is now handled EXCLUSIVELY by init-all.sh
#     which uses the ZTDF-encrypted TypeScript seeder.
#
#     DO NOT call seed-resources.sh here - it creates PLAINTEXT resources
#     which violate ACP-240 compliance requirements.
#
#     All resources MUST be ZTDF-encrypted via:
#       npm run seed:instance -- --instance=<CODE> --count=5000 --replace
#
#     This is called automatically by init-all.sh Step 4.
# =============================================================================
log_info "Resource seeding skipped - will be handled by init-all.sh (ZTDF-only)"

# Initialize NextAuth database schema (required for SSO)
if [[ -x "${SCRIPT_DIR}/init-nextauth-db.sh" ]]; then
    log_info "Running init-nextauth-db.sh..."
    "${SCRIPT_DIR}/init-nextauth-db.sh" "${INSTANCE_CODE}" || {
        log_warn "NextAuth DB init failed - you can run manually: ./scripts/spoke-init/init-nextauth-db.sh ${INSTANCE_CODE}"
    }
else
    log_warn "init-nextauth-db.sh not found - NextAuth sessions may not work"
fi

log_info "Keycloak initialization complete for ${INSTANCE_CODE}"
