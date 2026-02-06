#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Spoke User Seeding Script
#
# Purpose: Create test users with proper DIVE attributes for a spoke instance
#
# Usage: ./seed-spoke-users.sh <INSTANCE_CODE>
# Example: ./seed-spoke-users.sh EST
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Get instance code
INSTANCE_CODE="${1:-}"
if [ -z "$INSTANCE_CODE" ]; then
    echo "Error: Instance code required"
    echo "Usage: $0 <INSTANCE_CODE>"
    echo "Example: $0 EST"
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
CLIENT_ID="dive-v3-broker-${CODE_LOWER}"
ADMIN_USER="admin"
TEST_USER_PASSWORD="TestUser2025!Pilot"
ADMIN_USER_PASSWORD="${ADMIN_USER_PASSWORD:-TestUser2025!SecureAdmin}"

# Get admin password from container environment
ADMIN_PASSWORD=$(docker exec "$KEYCLOAK_CONTAINER" printenv KC_BOOTSTRAP_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r' || echo "")
if [ -z "$ADMIN_PASSWORD" ]; then
    ADMIN_PASSWORD=$(docker exec "$KEYCLOAK_CONTAINER" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r' || echo "")
fi

if [ -z "$ADMIN_PASSWORD" ]; then
    # Try loading from .env file
    ENV_FILE="${PROJECT_ROOT}/instances/${CODE_LOWER}/.env"
    if [ -f "$ENV_FILE" ]; then
        ADMIN_PASSWORD=$(grep "^KEYCLOAK_ADMIN_PASSWORD=" "$ENV_FILE" | cut -d'=' -f2- | tr -d '\n\r' || echo "")
    fi
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
echo "║         DIVE V3 Spoke User Seeding                           ║"
echo "║              Instance: $CODE_UPPER                                 ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# =============================================================================
# Authenticate with kcadm
# =============================================================================
log_step "Authenticating with Keycloak Admin CLI..."

docker exec "$KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh config credentials \
    --server http://localhost:8080 \
    --realm master \
    --user "$ADMIN_USER" \
    --password "$ADMIN_PASSWORD" >/dev/null 2>&1

if [ $? -ne 0 ]; then
    log_error "Authentication failed"
    exit 1
fi

log_success "Authenticated as $ADMIN_USER"

# =============================================================================
# Check if realm exists
# =============================================================================
log_step "Checking realm: $REALM_NAME..."

REALM_EXISTS=$(docker exec "$KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh get realms/$REALM_NAME 2>/dev/null | grep -c "\"realm\"" 2>/dev/null || echo "0")

if [ "$REALM_EXISTS" -eq 0 ] 2>/dev/null || [ -z "$REALM_EXISTS" ]; then
    log_error "Realm $REALM_NAME not found"
    exit 1
fi

log_success "Realm $REALM_NAME exists"

# =============================================================================
# Create Test Users
# =============================================================================
log_step "Creating test users for $CODE_UPPER..."

# Function to create a user
create_user() {
    local username="$1"
    local email="$2"
    local first_name="$3"
    local last_name="$4"
    local clearance="$5"  # NATO standard clearance (stored in Keycloak)
    local coi="${6:-}"
    local password="${7:-$TEST_USER_PASSWORD}"
    local is_admin="${8:-false}"  # CRITICAL: Admin flag for role assignment

    log_info "Creating: $username ($clearance)${is_admin:+ [ADMIN]}"

    # Check if user already exists
    local user_exists=$(docker exec "$KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh get users \
        -r "$REALM_NAME" \
        -q username="$username" 2>/dev/null | grep -c "\"username\"" 2>/dev/null || echo "0")

    if [ "$user_exists" -gt 0 ] 2>/dev/null && [ -n "$user_exists" ]; then
        log_warn "User $username already exists - skipping"
        return 0
    fi

    # Create user with attributes
    # uniqueID should be just the username (per DIVE spec)
    local user_json=$(cat <<EOF
{
    "username": "$username",
    "email": "$email",
    "firstName": "$first_name",
    "lastName": "$last_name",
    "enabled": true,
    "emailVerified": true,
    "attributes": {
        "clearance": ["$clearance"],
        "countryOfAffiliation": ["$CODE_UPPER"],
        "uniqueID": ["$username"]
EOF
)

    # Add COI if provided
    if [ -n "$coi" ]; then
        user_json="${user_json},
        \"acpCOI\": [\"$coi\"]"
    fi

    user_json="${user_json}
    }
}"

    # Create user
    local user_id=$(echo "$user_json" | docker exec -i "$KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh create users \
        -r "$REALM_NAME" \
        -f - 2>&1 | grep "Created new user with id" | sed "s/Created new user with id '\(.*\)'/\1/" || echo "")

    if [ -z "$user_id" ]; then
        log_error "Failed to create user: $username"
        return 1
    fi

    # Set password
    docker exec "$KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh set-password \
        -r "$REALM_NAME" \
        --username "$username" \
        --new-password "$password" >/dev/null 2>&1

    if [ $? -ne 0 ]; then
        log_error "Failed to set password for: $username"
        return 1
    fi

    # CRITICAL: Assign dive-admin role if admin flag set (2026-02-04 fix)
    # This is REQUIRED for /admin route access in frontend
    if [ "$is_admin" = "true" ]; then
        log_info "Assigning dive-admin role to $username..."

        # Get dive-admin role ID (if role doesn't exist, skip gracefully)
        local role_id=$(docker exec "$KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh get roles/dive-admin \
            -r "$REALM_NAME" 2>/dev/null | jq -r '.id // empty')

        if [ -n "$role_id" ]; then
            # Assign role to user
            docker exec "$KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh add-roles \
                -r "$REALM_NAME" \
                --uusername "$username" \
                --rolename dive-admin >/dev/null 2>&1

            if [ $? -eq 0 ]; then
                log_success "✓ Assigned dive-admin role to $username"
            else
                log_warn "Could not assign dive-admin role (non-blocking)"
            fi
        else
            log_warn "dive-admin role not found in realm (run realm configuration first)"
        fi
    fi

    log_success "Created: $username ($clearance)"
    return 0
}

# =============================================================================
# Create Users for this Spoke
# =============================================================================

# Standard test users (5 users with varying clearances)
create_user "testuser-${CODE_LOWER}-1" "testuser-${CODE_LOWER}-1@${CODE_LOWER}.dive25.mil" "Test" "User 1" "UNCLASSIFIED" "" "$TEST_USER_PASSWORD"
create_user "testuser-${CODE_LOWER}-2" "testuser-${CODE_LOWER}-2@${CODE_LOWER}.dive25.mil" "Test" "User 2" "RESTRICTED" "" "$TEST_USER_PASSWORD"
create_user "testuser-${CODE_LOWER}-3" "testuser-${CODE_LOWER}-3@${CODE_LOWER}.dive25.mil" "Test" "User 3" "CONFIDENTIAL" "" "$TEST_USER_PASSWORD"
create_user "testuser-${CODE_LOWER}-4" "testuser-${CODE_LOWER}-4@${CODE_LOWER}.dive25.mil" "Test" "User 4" "SECRET" "NATO" "$TEST_USER_PASSWORD"
create_user "testuser-${CODE_LOWER}-5" "testuser-${CODE_LOWER}-5@${CODE_LOWER}.dive25.mil" "Test" "User 5" "TOP_SECRET" "NATO,FVEY" "$TEST_USER_PASSWORD"

# Admin user (uses ADMIN_USER_PASSWORD for consistency with Hub admin-usa)
create_user "admin-${CODE_LOWER}" "admin-${CODE_LOWER}@${CODE_LOWER}.dive25.mil" "Admin" "User" "TOP_SECRET" "NATO,FVEY" "$ADMIN_USER_PASSWORD" "true"

# =============================================================================
# Summary
# =============================================================================
echo ""
log_success "User seeding complete for $CODE_UPPER"

# Count users
USER_COUNT=$(docker exec "$KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh get users -r "$REALM_NAME" 2>/dev/null | grep -c "\"username\"" || echo "0")

log_info "Total users in realm: $USER_COUNT"
echo ""
echo "Test Credentials:"
echo "  Username: testuser-${CODE_LOWER}-{1-5}"
echo "  Password: $TEST_USER_PASSWORD"
echo ""
echo "Admin Credentials:"
echo "  Username: admin-${CODE_LOWER}"
echo "  Password: $ADMIN_USER_PASSWORD"
echo ""
echo "Realm: $REALM_NAME"
echo ""
