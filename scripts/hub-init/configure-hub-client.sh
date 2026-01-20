#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Hub Client Configuration Script
#
# Purpose: Configure the dive-v3-broker-usa client with proper settings including:
#   - post.logout.redirect.uris for federated logout
#   - Other required OIDC settings
#
# CRITICAL: Without post.logout.redirect.uris, the federated logout will fail
# and users will remain logged in to Keycloak SSO after clicking Sign Out.
#
# Usage: ./configure-hub-client.sh
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

log_step()  { echo -e "${BLUE}▶${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }
log_info()  { echo -e "${CYAN}ℹ${NC} $1"; }
log_verbose() { echo -e "${CYAN}  ${NC}$1"; }

# Configuration
KEYCLOAK_URL="${KEYCLOAK_URL:-https://localhost:8443}"
REALM_NAME="${REALM_NAME:-dive-v3-broker-usa}"
CLIENT_ID="${CLIENT_ID:-dive-v3-broker-usa}"
ADMIN_USER="${KEYCLOAK_ADMIN:-admin}"
ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-}"

# Get admin password from container if not set
# Try multiple container names for compatibility (dive-v3-backend, dive-hub-backend, keycloak)
if [ -z "$ADMIN_PASSWORD" ]; then
    for container in "dive-v3-backend" "dive-hub-backend" "dive-v3-keycloak"; do
        if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
            ADMIN_PASSWORD=$(docker exec "$container" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null || echo "")
            [ -n "$ADMIN_PASSWORD" ] && break
        fi
    done
fi

if [ -z "$ADMIN_PASSWORD" ]; then
    log_error "KEYCLOAK_ADMIN_PASSWORD not found"
    exit 1
fi

echo ""
echo "=========================================="
echo "  DIVE V3 Hub Client Configuration"
echo "=========================================="
echo ""

# Get admin token
log_step "Authenticating with Keycloak..."
TOKEN=$(curl -sk -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
    -d "grant_type=password" \
    -d "client_id=admin-cli" \
    -d "username=${ADMIN_USER}" \
    -d "password=${ADMIN_PASSWORD}" | jq -r '.access_token')

if [ -z "$TOKEN" ] || [ "$TOKEN" == "null" ]; then
    log_error "Failed to get admin token"
    exit 1
fi
log_success "Authenticated as admin"

# Get or create client
log_step "Finding client ${CLIENT_ID}..."
CLIENT_UUID=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients" \
    -H "Authorization: Bearer ${TOKEN}" | jq -r ".[] | select(.clientId == \"${CLIENT_ID}\") | .id")

if [ -z "$CLIENT_UUID" ] || [ "$CLIENT_UUID" == "null" ]; then
    log_warn "Client ${CLIENT_ID} not found - creating it..."

    # Get the client secret from environment
    CLIENT_SECRET="${AUTH_KEYCLOAK_SECRET:-}"
    if [ -z "$CLIENT_SECRET" ]; then
        CLIENT_SECRET=$(docker exec dive-hub-frontend printenv AUTH_KEYCLOAK_SECRET 2>/dev/null || echo "")
    fi
    if [ -z "$CLIENT_SECRET" ]; then
        CLIENT_SECRET=$(openssl rand -base64 24)
        log_warn "Generated new client secret (update frontend AUTH_KEYCLOAK_SECRET)"
    fi

    # Create the client
    HTTP_CODE=$(curl -sk -o /dev/null -w "%{http_code}" \
        -X POST "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients" \
        -H "Authorization: Bearer ${TOKEN}" \
        -H "Content-Type: application/json" \
        -d "{
            \"clientId\": \"${CLIENT_ID}\",
            \"name\": \"DIVE V3 Frontend Client\",
            \"enabled\": true,
            \"protocol\": \"openid-connect\",
            \"publicClient\": false,
            \"standardFlowEnabled\": true,
            \"directAccessGrantsEnabled\": true,
            \"secret\": \"${CLIENT_SECRET}\",
            \"redirectUris\": [\"https://localhost:3000/*\", \"http://localhost:3000/*\"],
            \"webOrigins\": [\"https://localhost:3000\", \"http://localhost:3000\"],
            \"attributes\": {
                \"post.logout.redirect.uris\": \"https://localhost:3000/*##http://localhost:3000/*\"
            }
        }")

    if [ "$HTTP_CODE" == "201" ]; then
        log_success "Created client ${CLIENT_ID}"
        # Get the new client UUID
        CLIENT_UUID=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients" \
            -H "Authorization: Bearer ${TOKEN}" | jq -r ".[] | select(.clientId == \"${CLIENT_ID}\") | .id")
    else
        log_error "Failed to create client (HTTP $HTTP_CODE)"
        exit 1
    fi
else
    log_success "Found existing client: ${CLIENT_UUID}"
fi

# =============================================================================
# CRITICAL: Sync Client Secret from GCP (SSOT)
# =============================================================================
# SF-027 FIX: Ensure Keycloak client secret matches what frontend/backend use
# Without this, authentication fails with "Invalid client credentials"
# =============================================================================

log_step "Synchronizing client secret from GCP (SSOT)..."

# Get secret from environment (loaded from GCP by hub deployment)
GCP_CLIENT_SECRET="${KEYCLOAK_CLIENT_SECRET:-}"

# Fallback: Try to get from frontend container
if [ -z "$GCP_CLIENT_SECRET" ]; then
    GCP_CLIENT_SECRET=$(docker exec dive-hub-frontend printenv KEYCLOAK_CLIENT_SECRET 2>/dev/null || echo "")
fi

# Fallback: Try to get from backend container
if [ -z "$GCP_CLIENT_SECRET" ]; then
    GCP_CLIENT_SECRET=$(docker exec dive-hub-backend printenv KEYCLOAK_CLIENT_SECRET 2>/dev/null || echo "")
fi

if [ -z "$GCP_CLIENT_SECRET" ]; then
    log_error "Cannot get client secret from GCP or containers"
    log_error "This will cause authentication failures!"
    exit 1
fi

log_verbose "Client secret from GCP/containers: ${GCP_CLIENT_SECRET:0:10}..."

# Get current secret from Keycloak
KEYCLOAK_SECRET=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}/client-secret" \
    -H "Authorization: Bearer ${TOKEN}" | jq -r '.value // empty')

if [ -z "$KEYCLOAK_SECRET" ]; then
    log_warn "Client has no secret in Keycloak - setting it now"
    
    # Use REST API to set the secret
    HTTP_CODE=$(curl -sk -o /dev/null -w "%{http_code}" \
        -X PUT "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}" \
        -H "Authorization: Bearer ${TOKEN}" \
        -H "Content-Type: application/json" \
        -d "{\"secret\":\"${GCP_CLIENT_SECRET}\"}")
    
    if [ "$HTTP_CODE" = "204" ] || [ "$HTTP_CODE" = "200" ]; then
        log_success "✓ Client secret set from GCP"
        KEYCLOAK_SECRET="${GCP_CLIENT_SECRET}"
    else
        log_error "✗ Failed to set client secret (HTTP $HTTP_CODE)"
        exit 1
    fi
elif [ "$KEYCLOAK_SECRET" != "$GCP_CLIENT_SECRET" ]; then
    log_warn "Client secret mismatch detected!"
    log_warn "  Keycloak: ${KEYCLOAK_SECRET:0:10}..."
    log_warn "  GCP/Env:  ${GCP_CLIENT_SECRET:0:10}..."
    log_warn "  Updating Keycloak to match GCP (SSOT)..."
    
    # Update client secret via REST API
    HTTP_CODE=$(curl -sk -o /dev/null -w "%{http_code}" \
        -X PUT "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}" \
        -H "Authorization: Bearer ${TOKEN}" \
        -H "Content-Type: application/json" \
        -d "{\"secret\":\"${GCP_CLIENT_SECRET}\"}")
    
    if [ "$HTTP_CODE" = "204" ] || [ "$HTTP_CODE" = "200" ]; then
        # Verify it was set correctly
        VERIFY_SECRET=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}/client-secret" \
            -H "Authorization: Bearer ${TOKEN}" | jq -r '.value')
        
        if [ "$VERIFY_SECRET" = "$GCP_CLIENT_SECRET" ]; then
            log_success "✓ Client secret synchronized with GCP"
        else
            log_error "✗ Secret sync verification failed!"
            log_error "  Expected: ${GCP_CLIENT_SECRET:0:10}..."
            log_error "  Got:      ${VERIFY_SECRET:0:10}..."
            log_error "  This is a critical issue - frontend/backend will fail to authenticate"
            exit 1
        fi
    else
        log_error "✗ Failed to update client secret (HTTP $HTTP_CODE)"
        exit 1
    fi
else
    log_success "✓ Client secret already matches GCP (in sync)"
fi

# Get current client configuration
log_step "Fetching current client configuration..."
CLIENT_CONFIG=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}" \
    -H "Authorization: Bearer ${TOKEN}")

# Check current post_logout_redirect_uris
CURRENT_LOGOUT_URIS=$(echo "$CLIENT_CONFIG" | jq -r '.attributes["post.logout.redirect.uris"] // "null"')
log_info "Current post.logout.redirect.uris: ${CURRENT_LOGOUT_URIS}"

# Define required logout URIs (with wildcards for proper matching)
REQUIRED_LOGOUT_URIS="http://localhost:3000/*##https://localhost:3000/*##https://*.dive25.com/*##https://*.prosecurity.biz/*"

# Always update to ensure correct configuration (fixes missing wildcards or domains)
log_step "Configuring post.logout.redirect.uris..."
UPDATED_CONFIG=$(echo "$CLIENT_CONFIG" | jq --arg uris "$REQUIRED_LOGOUT_URIS" '.attributes["post.logout.redirect.uris"] = $uris')

# Update client
HTTP_CODE=$(curl -sk -o /dev/null -w "%{http_code}" \
    -X PUT "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$UPDATED_CONFIG")

if [ "$HTTP_CODE" == "204" ]; then
    log_success "Client updated with post.logout.redirect.uris"
else
    log_error "Failed to update client (HTTP $HTTP_CODE)"
    exit 1
fi

# Verify the update
log_step "Verifying configuration..."
VERIFY_CONFIG=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}" \
    -H "Authorization: Bearer ${TOKEN}")
VERIFIED_URIS=$(echo "$VERIFY_CONFIG" | jq -r '.attributes["post.logout.redirect.uris"]')
log_success "Verified: ${VERIFIED_URIS}"

# =============================================================================
# Configure Protocol Mappers for Federated Identity Attributes
# These mappers ensure claims from federated IdPs flow through to the frontend
# =============================================================================
echo ""
log_step "Configuring protocol mappers for federated identity attributes..."

# Get existing mappers
EXISTING_MAPPERS=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}/protocol-mappers/models" \
    -H "Authorization: Bearer ${TOKEN}" 2>/dev/null)

# Function to create a mapper if it doesn't exist
create_mapper() {
    local name="$1"
    local multivalued="${2:-false}"

    # Check if mapper already exists
    local existing_id=$(echo "$EXISTING_MAPPERS" | jq -r ".[] | select(.name == \"$name\") | .id // empty")

    if [ -n "$existing_id" ]; then
        log_info "Mapper '$name' already exists, skipping"
    else
        log_step "Creating mapper: $name"
        local HTTP_CODE=$(curl -sk -o /dev/null -w "%{http_code}" \
            -X POST "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}/protocol-mappers/models" \
            -H "Authorization: Bearer ${TOKEN}" \
            -H "Content-Type: application/json" \
            -d "{
                \"name\": \"$name\",
                \"protocol\": \"openid-connect\",
                \"protocolMapper\": \"oidc-usermodel-attribute-mapper\",
                \"config\": {
                    \"claim.name\": \"$name\",
                    \"user.attribute\": \"$name\",
                    \"jsonType.label\": \"String\",
                    \"id.token.claim\": \"true\",
                    \"access.token.claim\": \"true\",
                    \"userinfo.token.claim\": \"true\",
                    \"multivalued\": \"$multivalued\"
                }
            }")

        if [ "$HTTP_CODE" == "201" ]; then
            log_success "Created mapper: $name"
        else
            log_warn "Failed to create mapper '$name' (HTTP $HTTP_CODE) - may already exist"
        fi
    fi
}

# Create all required mappers
create_mapper "clearance" "false"
create_mapper "countryOfAffiliation" "false"
create_mapper "uniqueID" "false"
create_mapper "acpCOI" "true"

log_success "Protocol mappers configured"

echo ""
log_success "Hub client configuration complete!"
echo ""
echo "The following logout redirect URIs are now configured:"
echo "  - http://localhost:3000/*"
echo "  - https://localhost:3000/*"
echo "  - https://*.dive25.com/*"
echo "  - https://*.prosecurity.biz/*"
echo ""
echo "Federated logout will now properly terminate Keycloak SSO sessions."
echo ""
