#!/bin/bash
# =============================================================================
# DIVE V3 Spoke User Seeding
# =============================================================================
# Creates test users with proper DIVE attributes (clearance, country, COI)
# Usage: ./seed-users.sh <INSTANCE_CODE> [KEYCLOAK_URL] [ADMIN_PASSWORD]
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
    exit 1
fi

CODE_LOWER=$(echo "$INSTANCE_CODE" | tr '[:upper:]' '[:lower:]')
CODE_UPPER=$(echo "$INSTANCE_CODE" | tr '[:lower:]' '[:upper:]')
REALM_NAME="dive-v3-broker-${CODE_LOWER}"

# Load configuration from .env
INSTANCE_DIR="instances/${CODE_LOWER}"
if [[ -f "${INSTANCE_DIR}/.env" ]]; then
    source "${INSTANCE_DIR}/.env"
fi

ADMIN_PASSWORD="${ADMIN_PASSWORD:-${KEYCLOAK_ADMIN_PASSWORD:-admin}}"

# Keycloak container and internal URL
KC_CONTAINER="dive-v3-keycloak-${CODE_LOWER}"
KEYCLOAK_INTERNAL_URL="https://localhost:8443"
PUBLIC_KEYCLOAK_URL="${PUBLIC_KEYCLOAK_URL:-https://${CODE_LOWER}-idp.dive25.com}"

# Helper function to call Keycloak API via Docker exec
kc_curl() {
    docker exec "$KC_CONTAINER" curl -sk "$@" 2>/dev/null
}

# Country-specific settings
declare -A COUNTRY_NAMES=(
    [usa]="United States"
    [fra]="France"
    [gbr]="United Kingdom"
    [deu]="Germany"
    [can]="Canada"
)
COUNTRY_NAME="${COUNTRY_NAMES[$CODE_LOWER]:-$CODE_UPPER}"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           DIVE V3 Spoke User Seeding                         ║"
echo "║              Instance: ${CODE_UPPER} (${COUNTRY_NAME})                      ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# =============================================================================
# Get Admin Token
# =============================================================================
log_step "Authenticating with Keycloak..."

TOKEN=$(kc_curl -X POST "${KEYCLOAK_INTERNAL_URL}/realms/master/protocol/openid-connect/token" \
    -d "client_id=admin-cli" \
    -d "username=admin" \
    -d "password=${ADMIN_PASSWORD}" \
    -d "grant_type=password" 2>/dev/null | jq -r '.access_token')

if [[ -z "$TOKEN" || "$TOKEN" == "null" ]]; then
    log_error "Failed to authenticate"
    exit 1
fi
log_success "Authenticated"

# =============================================================================
# Define Test Users
# =============================================================================
# Generate secure password (meets Keycloak complexity requirements)
generate_password() {
    echo "Dive@$(openssl rand -hex 4)$(date +%S)!"
}

# Users for this instance with varying clearance levels
USERS=(
    # username|firstName|lastName|email|clearance|coi
    "testuser-${CODE_LOWER}|Test|User|testuser@${CODE_LOWER}.dive25.com|SECRET|"
    "analyst-${CODE_LOWER}|Intel|Analyst|analyst@${CODE_LOWER}.dive25.com|TOP_SECRET|NATO-COSMIC,FVEY"
    "officer-${CODE_LOWER}|Staff|Officer|officer@${CODE_LOWER}.dive25.com|SECRET|NATO"
    "admin-${CODE_LOWER}|System|Admin|admin@${CODE_LOWER}.dive25.com|TOP_SECRET|NATO-COSMIC,FVEY,FIVE_EYES"
    "unclass-${CODE_LOWER}|Public|User|public@${CODE_LOWER}.dive25.com|UNCLASSIFIED|"
)

# =============================================================================
# Create Users
# =============================================================================
log_step "Creating test users..."

CREATED=0
SKIPPED=0

for USER_DEF in "${USERS[@]}"; do
    IFS='|' read -r USERNAME FIRST LAST EMAIL CLEARANCE COI <<< "$USER_DEF"
    
    # Check if user exists
    USER_EXISTS=$(kc_curl -H "Authorization: Bearer $TOKEN" \
        "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/users?username=${USERNAME}" 2>/dev/null | \
        jq -r '.[0].id // empty')
    
    if [[ -n "$USER_EXISTS" ]]; then
        log_info "User exists: ${USERNAME}"
        ((SKIPPED++))
        continue
    fi
    
    # Generate password
    PASSWORD=$(generate_password)
    
    # Build attributes JSON
    ATTRS="{\"clearance\": [\"${CLEARANCE}\"], \"countryOfAffiliation\": [\"${CODE_UPPER}\"], \"uniqueID\": [\"${USERNAME}-001\"]"
    if [[ -n "$COI" ]]; then
        ATTRS="${ATTRS}, \"acpCOI\": [\"${COI}\"]"
    fi
    ATTRS="${ATTRS}}"
    
    # Create user
    HTTP_CODE=$(kc_curl -w "%{http_code}" -o /dev/null -X POST \
        "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/users" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"username\": \"${USERNAME}\",
            \"email\": \"${EMAIL}\",
            \"emailVerified\": true,
            \"enabled\": true,
            \"firstName\": \"${FIRST}\",
            \"lastName\": \"${LAST}\",
            \"attributes\": ${ATTRS}
        }" 2>/dev/null)
    
    if [[ "$HTTP_CODE" == "201" ]]; then
        # Get user ID
        USER_ID=$(kc_curl -H "Authorization: Bearer $TOKEN" \
            "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/users?username=${USERNAME}" 2>/dev/null | \
            jq -r '.[0].id')
        
        # Set password
        kc_curl -X PUT "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/users/${USER_ID}/reset-password" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d "{\"type\": \"password\", \"value\": \"${PASSWORD}\", \"temporary\": false}" 2>/dev/null
        
        log_success "Created: ${USERNAME} (password: ${PASSWORD})"
        ((CREATED++))
    else
        log_warn "Failed to create: ${USERNAME} (HTTP ${HTTP_CODE})"
    fi
done

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                  User Seeding Complete                       ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Created: ${CREATED} users                                           ║"
echo "║  Skipped: ${SKIPPED} users (already existed)                         ║"
echo "║                                                              ║"
echo "║  Available Test Users:                                       ║"
echo "║    - testuser-${CODE_LOWER}   (SECRET)                              ║"
echo "║    - analyst-${CODE_LOWER}    (TOP_SECRET, NATO-COSMIC/FVEY)        ║"
echo "║    - officer-${CODE_LOWER}    (SECRET, NATO)                        ║"
echo "║    - admin-${CODE_LOWER}      (TOP_SECRET, full COI)                ║"
echo "║    - unclass-${CODE_LOWER}    (UNCLASSIFIED)                        ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

log_info "Next: Run ./scripts/spoke-init/seed-resources.sh ${INSTANCE_CODE}"

