#!/bin/bash
# =============================================================================
# DIVE V3 Hub User Seeding Script
# 
# Purpose: Create test users with proper DIVE attributes on the Hub (USA)
# 
# CRITICAL: Keycloak 26+ requires User Profile configuration BEFORE
# custom attributes can be stored on users. This script:
#   1. Configures User Profile with DIVE attributes (clearance, country, etc.)
#   2. Creates test users with proper attributes
#   3. Fixes protocol mappers for multivalued attributes
#
# Usage: ./seed-hub-users.sh
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
TEST_USER_PASSWORD="${TEST_USER_PASSWORD:-TestUser2025!Pilot}"
ADMIN_USER_PASSWORD="${ADMIN_USER_PASSWORD:-TestUser2025!SecureAdmin}"

# Get admin password from container if not set
if [ -z "$ADMIN_PASSWORD" ]; then
    ADMIN_PASSWORD=$(docker exec dive-hub-backend printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null || echo "")
fi

if [ -z "$ADMIN_PASSWORD" ]; then
    log_error "KEYCLOAK_ADMIN_PASSWORD not found"
    exit 1
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         DIVE V3 Hub User Seeding                             ║"
echo "║              Instance: USA (Hub)                             ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# =============================================================================
# Authenticate with Keycloak
# =============================================================================
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

# =============================================================================
# Configure User Profile (Keycloak 26+ CRITICAL)
# =============================================================================
log_step "Configuring User Profile for DIVE attributes..."

# Check if DIVE attributes already exist
EXISTING_ATTRS=$(curl -sk -H "Authorization: Bearer $TOKEN" \
    "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/users/profile" | jq -r '.attributes[].name' | tr '\n' ' ')

if [[ ! "$EXISTING_ATTRS" =~ "clearance" ]]; then
    curl -sk -X PUT "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/users/profile" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d '{
          "attributes": [
            {"name":"username","displayName":"${username}","validations":{"length":{"min":3,"max":255},"username-prohibited-characters":{},"up-username-not-idn-homograph":{}},"permissions":{"view":["admin","user"],"edit":["admin","user"]},"multivalued":false},
            {"name":"email","displayName":"${email}","validations":{"email":{},"length":{"max":255}},"required":{"roles":["user"]},"permissions":{"view":["admin","user"],"edit":["admin","user"]},"multivalued":false},
            {"name":"firstName","displayName":"${firstName}","validations":{"length":{"max":255},"person-name-prohibited-characters":{}},"required":{"roles":["user"]},"permissions":{"view":["admin","user"],"edit":["admin","user"]},"multivalued":false},
            {"name":"lastName","displayName":"${lastName}","validations":{"length":{"max":255},"person-name-prohibited-characters":{}},"required":{"roles":["user"]},"permissions":{"view":["admin","user"],"edit":["admin","user"]},"multivalued":false},
            {"name":"clearance","displayName":"Security Clearance","permissions":{"view":["admin","user"],"edit":["admin"]},"multivalued":false},
            {"name":"countryOfAffiliation","displayName":"Country of Affiliation","permissions":{"view":["admin","user"],"edit":["admin"]},"multivalued":false},
            {"name":"uniqueID","displayName":"Unique Identifier","permissions":{"view":["admin","user"],"edit":["admin"]},"multivalued":false},
            {"name":"acpCOI","displayName":"Community of Interest","permissions":{"view":["admin","user"],"edit":["admin"]},"multivalued":true}
          ],
          "groups":[
            {"name":"user-metadata","displayHeader":"User metadata","displayDescription":"Attributes, which refer to user metadata"},
            {"name":"dive-attributes","displayHeader":"DIVE Attributes","displayDescription":"Security clearance and coalition attributes"}
          ]
        }' > /dev/null 2>&1
    log_success "DIVE attributes added to User Profile"
else
    log_info "User Profile already configured"
fi

# =============================================================================
# Fix acpCOI Protocol Mapper (must be multivalued)
# =============================================================================
log_step "Fixing acpCOI protocol mapper..."

CLIENT_UUID=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients" \
    -H "Authorization: Bearer $TOKEN" | jq -r ".[] | select(.clientId == \"${CLIENT_ID}\") | .id")

if [ -n "$CLIENT_UUID" ] && [ "$CLIENT_UUID" != "null" ]; then
    MAPPER_ID=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}/protocol-mappers/models" \
        -H "Authorization: Bearer $TOKEN" | jq -r '.[] | select(.name == "acpCOI") | .id')
    
    if [ -n "$MAPPER_ID" ] && [ "$MAPPER_ID" != "null" ]; then
        curl -sk -X PUT "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}/protocol-mappers/models/${MAPPER_ID}" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d '{
                "id": "'"$MAPPER_ID"'",
                "name": "acpCOI",
                "protocol": "openid-connect",
                "protocolMapper": "oidc-usermodel-attribute-mapper",
                "consentRequired": false,
                "config": {
                    "introspection.token.claim": "true",
                    "userinfo.token.claim": "true",
                    "user.attribute": "acpCOI",
                    "id.token.claim": "true",
                    "access.token.claim": "true",
                    "claim.name": "acpCOI",
                    "jsonType.label": "String",
                    "multivalued": "true",
                    "aggregate.attrs": "false"
                }
            }' > /dev/null 2>&1
        log_success "acpCOI mapper set to multivalued"
    fi
fi

# =============================================================================
# Create Roles
# =============================================================================
log_step "Creating DIVE roles..."

for role in "dive-admin" "dive-user"; do
    ROLE_EXISTS=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/roles/${role}" \
        -H "Authorization: Bearer $TOKEN" -o /dev/null -w "%{http_code}")
    
    if [ "$ROLE_EXISTS" != "200" ]; then
        curl -sk -X POST "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/roles" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d "{\"name\": \"${role}\"}" > /dev/null 2>&1
        log_success "Created role: $role"
    else
        log_info "Role exists: $role"
    fi
done

# =============================================================================
# Create Users
# =============================================================================
create_user() {
    local username="$1"
    local email="$2"
    local first_name="$3"
    local last_name="$4"
    local clearance="$5"
    local coi="$6"
    local password="$7"
    local is_admin="$8"
    
    # Build COI array
    local coi_json="[]"
    if [ -n "$coi" ]; then
        coi_json=$(echo "$coi" | tr ',' '\n' | jq -R . | jq -s .)
    fi
    
    # Check if user exists
    local user_id=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/users?username=${username}" \
        -H "Authorization: Bearer $TOKEN" | jq -r '.[0].id // empty')
    
    if [ -n "$user_id" ]; then
        # Update existing user
        curl -sk -X PUT "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/users/${user_id}" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d "{
                \"firstName\": \"${first_name}\",
                \"lastName\": \"${last_name}\",
                \"email\": \"${email}\",
                \"emailVerified\": true,
                \"attributes\": {
                    \"clearance\": [\"${clearance}\"],
                    \"countryOfAffiliation\": [\"USA\"],
                    \"uniqueID\": [\"${username}-001\"],
                    \"acpCOI\": ${coi_json}
                }
            }" > /dev/null 2>&1
        log_info "Updated: ${username} (${clearance})"
    else
        # Create new user
        local http_code=$(curl -sk -X POST "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/users" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d "{
                \"username\": \"${username}\",
                \"email\": \"${email}\",
                \"enabled\": true,
                \"emailVerified\": true,
                \"firstName\": \"${first_name}\",
                \"lastName\": \"${last_name}\",
                \"credentials\": [{\"type\": \"password\", \"value\": \"${password}\", \"temporary\": false}],
                \"attributes\": {
                    \"clearance\": [\"${clearance}\"],
                    \"countryOfAffiliation\": [\"USA\"],
                    \"uniqueID\": [\"${username}-001\"],
                    \"acpCOI\": ${coi_json}
                }
            }" -o /dev/null -w "%{http_code}")
        
        if [ "$http_code" == "201" ]; then
            log_success "Created: ${username} (${clearance})"
            
            # Get new user ID and assign roles
            user_id=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/users?username=${username}" \
                -H "Authorization: Bearer $TOKEN" | jq -r '.[0].id')
            
            # Assign dive-user role
            local role_id=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/roles/dive-user" \
                -H "Authorization: Bearer $TOKEN" | jq -r '.id')
            if [ -n "$role_id" ] && [ "$role_id" != "null" ]; then
                curl -sk -X POST "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/users/${user_id}/role-mappings/realm" \
                    -H "Authorization: Bearer $TOKEN" \
                    -H "Content-Type: application/json" \
                    -d "[{\"id\": \"${role_id}\", \"name\": \"dive-user\"}]" > /dev/null 2>&1
            fi
            
            # Assign dive-admin role if admin
            if [ "$is_admin" == "true" ]; then
                local admin_role_id=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/roles/dive-admin" \
                    -H "Authorization: Bearer $TOKEN" | jq -r '.id')
                if [ -n "$admin_role_id" ] && [ "$admin_role_id" != "null" ]; then
                    curl -sk -X POST "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/users/${user_id}/role-mappings/realm" \
                        -H "Authorization: Bearer $TOKEN" \
                        -H "Content-Type: application/json" \
                        -d "[{\"id\": \"${admin_role_id}\", \"name\": \"dive-admin\"}]" > /dev/null 2>&1
                fi
            fi
        else
            log_warn "Failed to create: ${username} (HTTP ${http_code})"
        fi
    fi
}

log_step "Creating test users..."
echo ""
echo "  Creating testuser-usa-{1-4} with clearance levels:"
echo ""

# Test users with escalating clearance
create_user "testuser-usa-1" "testuser-usa-1@dive.mil" "Unclassified" "User" "UNCLASSIFIED" "" "$TEST_USER_PASSWORD" "false"
create_user "testuser-usa-2" "testuser-usa-2@dive.mil" "Confidential" "Analyst" "CONFIDENTIAL" "" "$TEST_USER_PASSWORD" "false"
create_user "testuser-usa-3" "testuser-usa-3@dive.mil" "Secret" "Officer" "SECRET" "NATO" "$TEST_USER_PASSWORD" "false"
create_user "testuser-usa-4" "testuser-usa-4@dive.mil" "TopSecret" "Director" "TOP_SECRET" "NATO,FVEY" "$TEST_USER_PASSWORD" "false"

log_step "Creating admin user..."
create_user "admin-usa" "admin-usa@dive.mil" "Admin" "User" "TOP_SECRET" "NATO,FVEY" "$ADMIN_USER_PASSWORD" "true"

# =============================================================================
# Verification
# =============================================================================
echo ""
log_step "Verifying user attributes..."

for user in testuser-usa-1 testuser-usa-2 testuser-usa-3 testuser-usa-4 admin-usa; do
    ATTRS=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/users?username=${user}" \
        -H "Authorization: Bearer $TOKEN" | jq -r '.[0].attributes.clearance[0] // "MISSING"')
    echo "  ${user}: clearance=${ATTRS}"
done

echo ""
log_success "Hub user seeding complete!"
echo ""
echo "  Test credentials:"
echo "    testuser-usa-{1-4}: ${TEST_USER_PASSWORD}"
echo "    admin-usa: ${ADMIN_USER_PASSWORD}"
echo ""

