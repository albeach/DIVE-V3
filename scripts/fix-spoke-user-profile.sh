#!/usr/bin/env bash
# =============================================================================
# Fix Spoke User Profile Permissions
#
# Purpose: Update User Profile to allow users to view their DIVE attributes
#
# ROOT CAUSE: Keycloak 26+ requires User Profile permissions with "view":["user"]
# for attributes to be included in ID tokens. Without this, federated attributes
# are NOT synced to Hub even if protocol mappers are configured correctly.
#
# This script fixes the issue discovered in Phase 4 Session 6 where testuser-gbr-1
# was missing clearance, countryOfAffiliation, and acpCOI after federation.
#
# Usage: ./fix-spoke-user-profile.sh <INSTANCE_CODE>
# Example: ./fix-spoke-user-profile.sh GBR
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Get instance code
INSTANCE_CODE="${1:-}"
if [ -z "$INSTANCE_CODE" ]; then
    echo "Error: Instance code required"
    echo "Usage: $0 <INSTANCE_CODE>"
    echo "Example: $0 GBR"
    exit 1
fi

CODE_UPPER=$(echo "$INSTANCE_CODE" | tr '[:lower:]' '[:upper:]')
CODE_LOWER=$(echo "$INSTANCE_CODE" | tr '[:upper:]' '[:lower:]')

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
KEYCLOAK_CONTAINER="dive-spoke-${CODE_LOWER}-keycloak"
REALM_NAME="dive-v3-broker-${CODE_LOWER}"

# Get admin password from container environment
ADMIN_PASSWORD=$(docker exec "$KEYCLOAK_CONTAINER" printenv KC_BOOTSTRAP_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r' || echo "")
if [ -z "$ADMIN_PASSWORD" ]; then
    ADMIN_PASSWORD=$(docker exec "$KEYCLOAK_CONTAINER" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r' || echo "")
fi

if [ -z "$ADMIN_PASSWORD" ]; then
    log_error "KEYCLOAK_ADMIN_PASSWORD not found for $CODE_UPPER"
    exit 1
fi

# Check if Keycloak container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${KEYCLOAK_CONTAINER}$"; then
    log_error "Keycloak container not running: $KEYCLOAK_CONTAINER"
    exit 1
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         Fix Spoke User Profile Permissions                   ║"
echo "║              Instance: $CODE_UPPER                                 ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

log_step "Getting Keycloak admin token..."

# Get external port for Keycloak
KEYCLOAK_PORT=$(docker port "$KEYCLOAK_CONTAINER" 8443 | head -1 | cut -d':' -f2)
KEYCLOAK_URL="https://localhost:${KEYCLOAK_PORT}"

TOKEN=$(curl -sk -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
    -d "grant_type=password" \
    -d "client_id=admin-cli" \
    -d "username=admin" \
    -d "password=${ADMIN_PASSWORD}" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
    log_error "Failed to get admin token"
    exit 1
fi

log_success "Got admin token"

# =============================================================================
# Check Current User Profile
# =============================================================================
log_step "Checking current User Profile configuration..."

USER_PROFILE=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/users/profile" \
    -H "Authorization: Bearer $TOKEN")

# Check if DIVE attributes have user view permission
# NOTE: amr/acr are NOT user attributes - they are native Keycloak v26 session claims
NEEDS_FIX=false
for attr in clearance countryOfAffiliation acpCOI uniqueID; do
    # Use jq instead of grep to avoid bracket escaping issues
    HAS_USER_VIEW=$(echo "$USER_PROFILE" | jq -r --arg attr "$attr" '
        (.attributes[]? | select(.name == $attr) | .permissions.view | contains(["user"])) // false |
        if . then "1" else "0" end
    ' 2>/dev/null || echo "0")

    if [ "$HAS_USER_VIEW" = "0" ]; then
        log_warn "Attribute '$attr' does NOT allow user view - will fix"
        NEEDS_FIX=true
    else
        log_info "Attribute '$attr' already allows user view"
    fi
done

if [ "$NEEDS_FIX" = false ]; then
    log_success "User Profile already configured correctly!"
    echo ""
    echo "All DIVE attributes have user view permissions."
    echo "No changes needed."
    exit 0
fi

# =============================================================================
# Update User Profile
# =============================================================================
log_step "Updating User Profile to allow user view for DIVE attributes..."

# Use Node.js to properly manipulate JSON
node << 'EOF'
const https = require('https');
const { execSync } = require('child_process');

const keycloakUrl = process.env.KEYCLOAK_URL;
const realm = process.env.REALM_NAME;
const token = process.env.TOKEN;

// Get current profile
const userProfile = JSON.parse(execSync(`curl -sk '${keycloakUrl}/admin/realms/${realm}/users/profile' -H 'Authorization: Bearer ${token}'`));

// Update DIVE attributes (NOT amr/acr - those are native Keycloak v26 session claims)
const diveAttrs = ['clearance', 'countryOfAffiliation', 'acpCOI', 'uniqueID'];
userProfile.attributes = userProfile.attributes.map(attr => {
    if (diveAttrs.includes(attr.name)) {
        return {
            ...attr,
            permissions: {
                view: ['admin', 'user'],
                edit: ['admin']
            }
        };
    }
    return attr;
});

// Write to temp file
const fs = require('fs');
fs.writeFileSync('/tmp/user-profile.json', JSON.stringify(userProfile));

EOF

KEYCLOAK_URL="$KEYCLOAK_URL" REALM_NAME="$REALM_NAME" TOKEN="$TOKEN" node << 'EOF'
const { execSync } = require('child_process');
const fs = require('fs');

const keycloakUrl = process.env.KEYCLOAK_URL;
const realm = process.env.REALM_NAME;
const token = process.env.TOKEN;

const userProfile = JSON.parse(fs.readFileSync('/tmp/user-profile.json', 'utf8'));

// Update
const result = execSync(`curl -sk -X PUT '${keycloakUrl}/admin/realms/${realm}/users/profile' -H 'Authorization: Bearer ${token}' -H 'Content-Type: application/json' -d '${JSON.stringify(userProfile).replace(/'/g, "'\\''")}' -w '%{http_code}'`).toString();

// Extract HTTP code from end of response
const httpCode = result.trim().slice(-3);
if (httpCode === '200') {
    console.log('✅ User Profile updated successfully!');
    process.exit(0);
} else {
    console.log(`❌ Failed with HTTP ${httpCode}`);
    process.exit(1);
}
EOF

if [ $? -eq 0 ]; then
    log_success "User Profile updated!"
    echo ""
    echo "  DIVE attributes now have user view permissions:"
    echo "    - clearance"
    echo "    - countryOfAffiliation"
    echo "    - acpCOI"
    echo "    - uniqueID"
    echo ""
    echo "  NOTE: amr/acr are native Keycloak v26 session claims, NOT user attributes"
    echo ""
log_step "Step 1/4: Initializing test users..."
  echo ""
  log_info "Test credentials (SSOT):"
  echo "    testuser-{instance}-1 to testuser-{instance}-4: TestUser2025!Pilot"
  echo "    admin-{instance}: TestUser2025!SecureAdmin"
  echo ""
  echo "  These attributes will now be included in ID tokens during federation!"
  echo ""
else
    log_error "Failed to update User Profile"
    exit 1
fi

# sc2034-anchor
: "${PROJECT_ROOT:-}"
