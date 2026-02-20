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
# Configure User Profile (Keycloak 26+ CRITICAL)
# =============================================================================
# CRITICAL: DIVE attributes MUST have "view":["admin","user"] to be included
# in tokens during federation. This is a Keycloak 26+ requirement.
#
# ROOT CAUSE FIX (Phase 4 Session 6): Without user view permission, attributes
# like clearance, countryOfAffiliation, and acpCOI are NOT included in ID tokens,
# causing federation attribute sync to fail.
#
# ROOT CAUSE FIX (2026-02-07): Python doesn't exist in Keycloak 26 minimal container.
# SOLUTION: Do JSON manipulation on HOST where jq is available, then pipe to container.
log_step "Configuring User Profile for DIVE attributes..."

# Get current User Profile as JSON
PROFILE_JSON=$(docker exec "$KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh get users/profile -r "$REALM_NAME" 2>/dev/null)

# Check if profile exists and has attributes
if echo "$PROFILE_JSON" | grep -q '"attributes"'; then
    log_info "User Profile exists - updating DIVE attribute permissions..."

    # Check if jq is available on HOST (not in container)
    if command -v jq &>/dev/null; then
        log_info "Using jq for JSON manipulation (host-side)"
        
        # Manipulate JSON on HOST using jq, then pipe to container
        # This works because jq runs locally, not in the minimal Keycloak container
        # Core DIVE attributes that need user view permission for federation:
        # clearance, clearanceNormalized, countryOfAffiliation, acpCOI, uniqueID
        # NOTE: amr/acr are native Keycloak v26 session claims, not user attributes

        # CRITICAL (2026-02-09): Add clearanceNormalized attribute if it doesn't exist
        UPDATED_PROFILE=$(echo "$PROFILE_JSON" | jq '
            # First, ensure clearanceNormalized attribute exists
            if (.attributes | map(.name) | contains(["clearanceNormalized"]) | not) then
                .attributes += [{
                    "name": "clearanceNormalized",
                    "displayName": "${clearanceNormalized}",
                    "required": false,
                    "permissions": {"view": ["admin", "user"], "edit": ["admin"]},
                    "validators": {},
                    "annotations": {}
                }]
            else
                .
            end |
            # Then update permissions for all DIVE attributes
            .attributes |= map(
                if .name == "clearance" or .name == "clearanceNormalized" or .name == "countryOfAffiliation" or .name == "acpCOI" or .name == "uniqueID" then
                    .permissions = {"view": ["admin", "user"], "edit": ["admin"]}
                else
                    .
                end
            )
        ')
        
        # Validate the updated profile is valid JSON
        if echo "$UPDATED_PROFILE" | jq empty 2>/dev/null; then
            # Update profile in Keycloak (temporarily disable set -e for non-critical update)
            set +e
            echo "$UPDATED_PROFILE" | docker exec -i "$KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh update users/profile -r "$REALM_NAME" -f - 2>/dev/null
            UPDATE_STATUS=$?
            set -e
            
            if [ $UPDATE_STATUS -eq 0 ]; then
                log_success "User Profile updated - DIVE attributes have user view permissions"
            else
                log_warn "Failed to update User Profile (kcadm returned $UPDATE_STATUS)"
                log_warn "Federation may not sync attributes correctly - check Admin Console"
            fi
        else
            log_error "JSON manipulation produced invalid JSON - skipping profile update"
            log_warn "User Profile permissions unchanged - federation may not work correctly"
        fi
    else
        log_warn "jq not available on host - cannot update User Profile"
        log_warn "Federation attribute sync may fail without user view permissions"
        log_warn "To fix: Install jq or manually set permissions in Keycloak Admin Console"
    fi
else
    log_warn "User Profile not found or empty - attributes may not be included in tokens"
fi

# =============================================================================
# Clearance Mapping Functions
# =============================================================================

##
# Map NATO standard clearance to country-specific classification
#
# SSOT: Reads from scripts/data/national-clearance-mappings.json
# Generated from: backend/src/services/clearance-mapper.service.ts (CLEARANCE_EQUIVALENCY_TABLE)
# Regenerate: cd backend && npx tsx src/scripts/generate-national-clearance-json.ts
#
# Users store their ACTUAL national classification (e.g., "OFFEN")
# not the normalized NATO standard (e.g., "UNCLASSIFIED").
# The backend clearance-mapper.service.ts normalizes for policy evaluation.
#
# Arguments:
#   $1 - NATO standard clearance (UNCLASSIFIED, RESTRICTED, CONFIDENTIAL, SECRET, TOP_SECRET)
#   $2 - Country code (ISO 3166-1 alpha-3)
#
# Returns:
#   Country-specific classification label
##
map_clearance_to_national() {
    local nato_level="$1"
    local country="$2"
    local mappings_file="${DIVE_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}/scripts/data/national-clearance-mappings.json"

    if [ -f "$mappings_file" ] && command -v jq &>/dev/null; then
        local result
        result=$(jq -r --arg c "$country" --arg l "$nato_level" '.[$c][$l] // empty' "$mappings_file" 2>/dev/null)
        if [ -n "$result" ]; then
            echo "$result"
            return
        fi
    fi

    # Fallback: Use NATO standard for unmapped countries or if jq unavailable
    log_warn "Using NATO standard clearance for $country: $nato_level (SSOT file: $mappings_file)"
    echo "$nato_level"
}

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
    local clearance="$5"  # Country-specific classification (e.g., "OFFEN" for DEU)
    local coi="${6:-}"
    local password="${7:-$TEST_USER_PASSWORD}"
    local is_admin="${8:-false}"  # CRITICAL: Admin flag for role assignment
    # NOTE (2026-02-09): Removed nato_clearance - backend is SSOT for normalization

    log_info "Creating: $username ($clearance)${is_admin:+ [ADMIN]}"

    # Check if user already exists
    local user_exists
    user_exists=$(docker exec "$KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh get users \
        -r "$REALM_NAME" \
        -q username="$username" 2>/dev/null | grep -c "\"username\"" 2>/dev/null || echo "0")

    if [ "$user_exists" -gt 0 ] 2>/dev/null && [ -n "$user_exists" ]; then
        log_warn "User $username already exists - skipping"
        return 0
    fi

    # Create user with attributes
    # uniqueID should be just the username (per DIVE spec)
    # NOTE (2026-02-09): Only country-specific clearance stored
    # Backend clearance-mapper.service.ts normalizes for policy evaluation (SSOT)
    local user_json
    user_json=$(cat <<EOF
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
    local user_id
    user_id=$(echo "$user_json" | docker exec -i "$KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh create users \
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
        local role_id
        role_id=$(docker exec "$KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh get roles/dive-admin \
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

# Map NATO standard clearances to country-specific classifications
# CRITICAL: Users must have their actual national classification for SSOT compliance
CLEARANCE_L1=$(map_clearance_to_national "UNCLASSIFIED" "$CODE_UPPER")
CLEARANCE_L2=$(map_clearance_to_national "RESTRICTED" "$CODE_UPPER")
CLEARANCE_L3=$(map_clearance_to_national "CONFIDENTIAL" "$CODE_UPPER")
CLEARANCE_L4=$(map_clearance_to_national "SECRET" "$CODE_UPPER")
CLEARANCE_L5=$(map_clearance_to_national "TOP_SECRET" "$CODE_UPPER")

log_info "Using country-specific clearances for $CODE_UPPER:"
log_info "  L1: $CLEARANCE_L1"
log_info "  L2: $CLEARANCE_L2"
log_info "  L3: $CLEARANCE_L3"
log_info "  L4: $CLEARANCE_L4"
log_info "  L5: $CLEARANCE_L5"

# Standard test users (5 users with varying clearances)
# NOTE (2026-02-09): Only country-specific clearance - backend normalizes for policy (SSOT)
create_user "testuser-${CODE_LOWER}-1" "testuser-${CODE_LOWER}-1@${CODE_LOWER}.dive25.mil" "Test" "User 1" "$CLEARANCE_L1" "" "$TEST_USER_PASSWORD"
create_user "testuser-${CODE_LOWER}-2" "testuser-${CODE_LOWER}-2@${CODE_LOWER}.dive25.mil" "Test" "User 2" "$CLEARANCE_L2" "" "$TEST_USER_PASSWORD"
create_user "testuser-${CODE_LOWER}-3" "testuser-${CODE_LOWER}-3@${CODE_LOWER}.dive25.mil" "Test" "User 3" "$CLEARANCE_L3" "NATO" "$TEST_USER_PASSWORD"
create_user "testuser-${CODE_LOWER}-4" "testuser-${CODE_LOWER}-4@${CODE_LOWER}.dive25.mil" "Test" "User 4" "$CLEARANCE_L4" "NATO" "$TEST_USER_PASSWORD"
create_user "testuser-${CODE_LOWER}-5" "testuser-${CODE_LOWER}-5@${CODE_LOWER}.dive25.mil" "Test" "User 5" "$CLEARANCE_L5" "NATO,FVEY" "$TEST_USER_PASSWORD"

# Admin user (uses ADMIN_USER_PASSWORD for consistency with Hub admin-usa)
create_user "admin-${CODE_LOWER}" "admin-${CODE_LOWER}@${CODE_LOWER}.dive25.mil" "Admin" "User" "$CLEARANCE_L5" "NATO,FVEY" "$ADMIN_USER_PASSWORD" "true"

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

# sc2034-anchor
: "${CLIENT_ID:-}"
