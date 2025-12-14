#!/bin/bash
# =============================================================================
# DIVE V3 Hub Client Configuration Script
# 
# Purpose: Configure the dive-v3-client-broker with proper settings including:
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

# Configuration
KEYCLOAK_URL="${KEYCLOAK_URL:-https://localhost:8443}"
REALM_NAME="${REALM_NAME:-dive-v3-broker}"
CLIENT_ID="${CLIENT_ID:-dive-v3-client-broker}"
ADMIN_USER="${KEYCLOAK_ADMIN:-admin}"
ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-}"

# Get admin password from container if not set
if [ -z "$ADMIN_PASSWORD" ]; then
    ADMIN_PASSWORD=$(docker exec dive-hub-backend printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null || echo "")
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

# Get client UUID
log_step "Finding client ${CLIENT_ID}..."
CLIENT_UUID=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients" \
    -H "Authorization: Bearer ${TOKEN}" | jq -r ".[] | select(.clientId == \"${CLIENT_ID}\") | .id")

if [ -z "$CLIENT_UUID" ] || [ "$CLIENT_UUID" == "null" ]; then
    log_error "Client ${CLIENT_ID} not found"
    exit 1
fi
log_success "Found client: ${CLIENT_UUID}"

# Get current client configuration
log_step "Fetching current client configuration..."
CLIENT_CONFIG=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}" \
    -H "Authorization: Bearer ${TOKEN}")

# Check current post_logout_redirect_uris
CURRENT_LOGOUT_URIS=$(echo "$CLIENT_CONFIG" | jq -r '.attributes["post.logout.redirect.uris"] // "null"')
log_info "Current post.logout.redirect.uris: ${CURRENT_LOGOUT_URIS}"

# Update client with post_logout_redirect_uris if not set
if [ "$CURRENT_LOGOUT_URIS" == "null" ] || [ -z "$CURRENT_LOGOUT_URIS" ]; then
    log_step "Configuring post.logout.redirect.uris..."
    
    # Add post.logout.redirect.uris to attributes
    # Keycloak uses ## as separator for multiple URIs
    UPDATED_CONFIG=$(echo "$CLIENT_CONFIG" | jq '.attributes["post.logout.redirect.uris"] = "http://localhost:3000/*##https://localhost:3000/*##https://*.dive25.com/*##https://*.prosecurity.biz/*"')
    
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
else
    log_success "post.logout.redirect.uris already configured"
fi

# Verify the update
log_step "Verifying configuration..."
VERIFY_CONFIG=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}" \
    -H "Authorization: Bearer ${TOKEN}")
VERIFIED_URIS=$(echo "$VERIFY_CONFIG" | jq -r '.attributes["post.logout.redirect.uris"]')
log_success "Verified: ${VERIFIED_URIS}"

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

