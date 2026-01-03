#!/bin/bash
# =============================================================================
# DIVE V3 AMR Attribute Sync Script
#
# Purpose: Synchronize AMR (Authentication Methods Reference) user attributes
#          based on each user's configured credentials (OTP, WebAuthn).
#
# Background: Keycloak 26's native oidc-amr-mapper doesn't populate AMR claims
#             because standard authenticators lack "reference" config properties.
#             WORKAROUND: Store AMR as user attribute, read by user attribute mapper.
#
# This script:
#   1. Scans all users in the realm
#   2. Checks each user's configured credentials (password, OTP, WebAuthn)
#   3. Updates their AMR attribute to reflect actual auth methods available
#
# Usage: ./sync-amr-attributes.sh [--realm REALM] [--user USERNAME]
#
# Examples:
#   ./sync-amr-attributes.sh                  # Sync all users in dive-v3-broker
#   ./sync-amr-attributes.sh --user testuser  # Sync specific user
#   ./sync-amr-attributes.sh --realm spoke-gbr # Sync users in GBR spoke realm
#
# Called by: ./dive hub amr sync
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

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
REALM_NAME="dive-v3-broker"
SPECIFIC_USER=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --realm)
            REALM_NAME="$2"
            shift 2
            ;;
        --user)
            SPECIFIC_USER="$2"
            shift 2
            ;;
        --dry-run|-n)
            DRY_RUN=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [--realm REALM] [--user USERNAME] [--dry-run]"
            echo ""
            echo "Options:"
            echo "  --realm REALM    Keycloak realm (default: dive-v3-broker)"
            echo "  --user USERNAME  Sync only this user"
            echo "  --dry-run, -n    Show what would be done without making changes"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Configuration
KEYCLOAK_URL="${KEYCLOAK_URL:-https://localhost:8443}"
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

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         DIVE V3 AMR Attribute Sync                           ║"
echo "║              Realm: ${REALM_NAME}                            "
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Authenticate with Keycloak
log_step "Authenticating with Keycloak..."

TOKEN=$(curl -sk -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
    -d "grant_type=password" \
    -d "client_id=admin-cli" \
    -d "username=${ADMIN_USER}" \
    -d "password=${ADMIN_PASSWORD}" | jq -r '.access_token')

if [ -z "$TOKEN" ] || [ "$TOKEN" == "null" ]; then
    log_error "Failed to authenticate with Keycloak"
    exit 1
fi
log_success "Authenticated"

# Function to get user's configured credentials
get_user_credentials() {
    local user_id="$1"
    curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/users/${user_id}/credentials" \
        -H "Authorization: Bearer $TOKEN"
}

# Function to build AMR array based on credentials
build_amr_array() {
    local credentials="$1"
    local clearance="$2"

    local amr='["pwd"'  # All users have password

    # Check for OTP credential
    local has_otp=$(echo "$credentials" | jq 'any(.type == "otp")')
    if [ "$has_otp" == "true" ]; then
        amr="${amr},\"otp\""
    fi

    # Check for WebAuthn credential
    local has_webauthn=$(echo "$credentials" | jq 'any(.type == "webauthn" or .type == "webauthn-passwordless")')
    if [ "$has_webauthn" == "true" ]; then
        amr="${amr},\"hwk\""
    fi

    amr="${amr}]"
    echo "$amr"
}

# Function to update user's AMR attribute
update_user_amr() {
    local user_id="$1"
    local username="$2"
    local new_amr="$3"

    # Get current user data
    local user_data=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/users/${user_id}" \
        -H "Authorization: Bearer $TOKEN")

    local current_amr=$(echo "$user_data" | jq -r '.attributes.amr // ["pwd"] | tojson')

    if [ "$current_amr" == "$new_amr" ]; then
        log_info "No change needed: ${username} (amr=${current_amr})"
        return 0
    fi

    if [ "$DRY_RUN" == "true" ]; then
        log_warn "Would update: ${username} (${current_amr} → ${new_amr})"
        return 0
    fi

    # Update the user's AMR attribute
    local updated_attrs=$(echo "$user_data" | jq --argjson amr "$new_amr" '.attributes.amr = $amr')

    curl -sk -X PUT "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/users/${user_id}" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "$updated_attrs" > /dev/null 2>&1

    log_success "Updated: ${username} (amr=${new_amr})"
}

# Get users to process
if [ -n "$SPECIFIC_USER" ]; then
    log_step "Looking up user: ${SPECIFIC_USER}"
    USERS=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/users?username=${SPECIFIC_USER}&exact=true" \
        -H "Authorization: Bearer $TOKEN")
else
    log_step "Fetching all users from realm..."
    USERS=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/users?max=1000" \
        -H "Authorization: Bearer $TOKEN")
fi

USER_COUNT=$(echo "$USERS" | jq 'length')
log_info "Found ${USER_COUNT} user(s) to process"

if [ "$DRY_RUN" == "true" ]; then
    log_warn "DRY RUN MODE - No changes will be made"
fi

echo ""

# Function to check if user is federated (has external IdP link)
is_federated_user() {
    local user_id="$1"
    local fed_identities=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/users/${user_id}/federated-identity" \
        -H "Authorization: Bearer $TOKEN")
    local count=$(echo "$fed_identities" | jq 'length')
    [ "$count" -gt 0 ]
}

# Process each user
UPDATED=0
SKIPPED=0

echo "$USERS" | jq -c '.[]' | while read -r user; do
    user_id=$(echo "$user" | jq -r '.id')
    username=$(echo "$user" | jq -r '.username')
    clearance=$(echo "$user" | jq -r '.attributes.clearance[0] // "UNCLASSIFIED"')

    # Skip service accounts
    if [[ "$username" == service-account-* ]]; then
        continue
    fi

    # CRITICAL FIX (Jan 2, 2026): Skip federated users
    # Federated users get their AMR from their home IdP via the IdP mapper
    # We should NOT overwrite their AMR based on local credentials (which don't exist)
    if is_federated_user "$user_id"; then
        # Get current AMR (set by IdP mapper)
        current_amr=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/users/${user_id}" \
            -H "Authorization: Bearer $TOKEN" | jq -r '.attributes.amr // ["pwd"] | tojson')
        log_info "Skipping federated user: ${username} (amr=${current_amr} from IdP)"
        continue
    fi

    # Get user's credentials
    credentials=$(get_user_credentials "$user_id")

    # Build the correct AMR array
    new_amr=$(build_amr_array "$credentials" "$clearance")

    # Update if needed
    update_user_amr "$user_id" "$username" "$new_amr"
done

echo ""
log_success "AMR sync complete"

if [ "$DRY_RUN" == "true" ]; then
    echo ""
    echo "Run without --dry-run to apply changes."
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  AMR Values (RFC 8176):"
echo "    pwd = Password authentication"
echo "    otp = One-time password (TOTP/HOTP)"
echo "    hwk = Hardware key (WebAuthn)"
echo ""
echo "  AAL Requirements (NIST 800-63B):"
echo "    AAL1 = Single factor (pwd)"
echo "    AAL2 = Two factors (pwd + otp)"
echo "    AAL3 = Hardware key (pwd + hwk)"
echo "═══════════════════════════════════════════════════════════════"


