#!/bin/bash
# =============================================================================
# DIVE V3 Spoke User Seeding
# =============================================================================
# Creates standardized test users with proper DIVE attributes and roles
# 
# Users Created:
#   - testuser-{country}-1  (UNCLASSIFIED)
#   - testuser-{country}-2  (CONFIDENTIAL)  
#   - testuser-{country}-3  (SECRET)
#   - testuser-{country}-4  (TOP_SECRET)
#   - admin-{country}       (TOP_SECRET + admin role)
#
# Passwords:
#   - Test users: TestUser2025!Pilot
#   - Admin user: TestUser2025!SecureAdmin
#
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
MAGENTA='\033[0;35m'
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

# Use backend container for API calls (has curl, on same network)
API_CONTAINER="dive-v3-backend-${CODE_LOWER}"
KEYCLOAK_INTERNAL_URL="https://keycloak-${CODE_LOWER}:8443"
PUBLIC_KEYCLOAK_URL="${PUBLIC_KEYCLOAK_URL:-https://${CODE_LOWER}-idp.dive25.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-${KEYCLOAK_ADMIN_PASSWORD:-admin}}"

# Helper function to call Keycloak API via Docker exec (uses backend container)
kc_curl() {
    docker exec "$API_CONTAINER" curl -sk "$@" 2>/dev/null
}

# =============================================================================
# STANDARDIZED PASSWORDS
# =============================================================================
TEST_USER_PASSWORD="TestUser2025!Pilot"
ADMIN_USER_PASSWORD="TestUser2025!SecureAdmin"

# =============================================================================
# CLEARANCE LEVEL MAPPING (POSIX-friendly)
# =============================================================================
# Level 1 = UNCLASSIFIED
# Level 2 = CONFIDENTIAL
# Level 3 = SECRET
# Level 4 = TOP_SECRET

map_clearance_level() {
    case "$1" in
        1) echo "UNCLASSIFIED" ;;
        2) echo "CONFIDENTIAL" ;;
        3) echo "SECRET" ;;
        4) echo "TOP_SECRET" ;;
        *) echo "UNCLASSIFIED" ;;
    esac
}

map_clearance_coi() {
    case "$1" in
        1) echo "" ;;
        2) echo "" ;;
        3) echo "NATO" ;;
        4) echo "NATO-COSMIC,FVEY" ;;
        *) echo "" ;;
    esac
}

# Country-specific settings (POSIX-friendly)
case "$CODE_LOWER" in
    usa) COUNTRY_NAME="United States" ;;
    fra) COUNTRY_NAME="France" ;;
    gbr) COUNTRY_NAME="United Kingdom" ;;
    deu) COUNTRY_NAME="Germany" ;;
    can) COUNTRY_NAME="Canada" ;;
    esp) COUNTRY_NAME="Spain" ;;
    ita) COUNTRY_NAME="Italy" ;;
    nld) COUNTRY_NAME="Netherlands" ;;
    pol) COUNTRY_NAME="Poland" ;;
    *)   COUNTRY_NAME="$CODE_UPPER" ;;
esac

echo ""
echo -e "${MAGENTA}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${MAGENTA}║           DIVE V3 Spoke User Seeding                         ║${NC}"
echo -e "${MAGENTA}║              Instance: ${CODE_UPPER} (${COUNTRY_NAME})                      ║${NC}"
echo -e "${MAGENTA}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# =============================================================================
# Get Admin Token
# =============================================================================
log_step "Authenticating with Keycloak..."

TOKEN=$(kc_curl -X POST "${KEYCLOAK_INTERNAL_URL}/realms/master/protocol/openid-connect/token" \
    -d "client_id=admin-cli" \
    -d "username=admin" \
    -d "password=${ADMIN_PASSWORD}" \
    -d "grant_type=password" | jq -r '.access_token')

if [[ -z "$TOKEN" || "$TOKEN" == "null" ]]; then
    log_error "Failed to authenticate with Keycloak"
    exit 1
fi
log_success "Authenticated"

# =============================================================================
# Configure User Profile (Keycloak 26+ requires this for custom attributes)
# =============================================================================
log_step "Configuring User Profile for DIVE attributes..."

# Check if DIVE attributes are already in the profile
EXISTING_ATTRS=$(kc_curl -H "Authorization: Bearer $TOKEN" \
    "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/users/profile" | jq -r '.attributes[].name' | tr '\n' ' ')

if [[ ! "$EXISTING_ATTRS" =~ "clearance" ]]; then
    kc_curl -X PUT "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/users/profile" \
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
          "groups":[{"name":"user-metadata","displayHeader":"User metadata","displayDescription":"Attributes, which refer to user metadata"},{"name":"dive-attributes","displayHeader":"DIVE Attributes","displayDescription":"Security clearance and coalition attributes"}]
        }' > /dev/null 2>&1
    log_success "DIVE attributes added to User Profile"
else
    log_info "User Profile already configured"
fi

# =============================================================================
# Create Roles
# =============================================================================
log_step "Creating roles..."

# Create admin role if not exists
ADMIN_ROLE_EXISTS=$(kc_curl -H "Authorization: Bearer $TOKEN" \
    "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/roles/dive-admin" | jq -r '.name // empty')

if [[ -z "$ADMIN_ROLE_EXISTS" ]]; then
    kc_curl -X POST "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/roles" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d '{
            "name": "dive-admin",
            "description": "DIVE V3 Administrator role with full access to admin console"
        }' 2>/dev/null
    log_success "Created role: dive-admin"
else
    log_info "Role exists: dive-admin"
fi

# Create user role if not exists
USER_ROLE_EXISTS=$(kc_curl -H "Authorization: Bearer $TOKEN" \
    "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/roles/dive-user" | jq -r '.name // empty')

if [[ -z "$USER_ROLE_EXISTS" ]]; then
    kc_curl -X POST "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/roles" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d '{
            "name": "dive-user",
            "description": "DIVE V3 Standard user role"
        }' 2>/dev/null
    log_success "Created role: dive-user"
else
    log_info "Role exists: dive-user"
fi

# =============================================================================
# Create Role Mapper for Client
# =============================================================================
log_step "Creating role mapper for client..."

CLIENT_ID="dive-v3-client-${CODE_LOWER}"
CLIENT_UUID=$(kc_curl -H "Authorization: Bearer $TOKEN" \
    "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/clients?clientId=${CLIENT_ID}" | \
    jq -r '.[0].id')

if [[ -n "$CLIENT_UUID" && "$CLIENT_UUID" != "null" ]]; then
    # Check if role mapper exists
    MAPPER_EXISTS=$(kc_curl -H "Authorization: Bearer $TOKEN" \
        "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}/protocol-mappers/models" | \
        jq -r '.[] | select(.name=="realm roles") | .name')
    
    if [[ -z "$MAPPER_EXISTS" ]]; then
        kc_curl -X POST "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}/protocol-mappers/models" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d '{
                "name": "realm roles",
                "protocol": "openid-connect",
                "protocolMapper": "oidc-usermodel-realm-role-mapper",
                "config": {
                    "multivalued": "true",
                    "claim.name": "roles",
                    "id.token.claim": "true",
                    "access.token.claim": "true",
                    "userinfo.token.claim": "true"
                }
            }' 2>/dev/null
        log_success "Created role mapper"
    else
        log_info "Role mapper exists"
    fi
fi

# =============================================================================
# Helper Function: Create User
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
    
    # Check if user exists
    local user_exists=$(kc_curl -H "Authorization: Bearer $TOKEN" \
        "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/users?username=${username}" | \
        jq -r '.[0].id // empty')
    
    if [[ -n "$user_exists" ]]; then
        log_info "User exists: ${username}"
        return 0
    fi
    
    # Build attributes JSON
    local attrs="{\"clearance\": [\"${clearance}\"], \"countryOfAffiliation\": [\"${CODE_UPPER}\"], \"uniqueID\": [\"${username}-001\"]"
    if [[ -n "$coi" ]]; then
        attrs="${attrs}, \"acpCOI\": [\"${coi}\"]"
    fi
    attrs="${attrs}}"
    
    # Create user
    local http_code=$(kc_curl -w "%{http_code}" -o /dev/null -X POST \
        "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/users" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"username\": \"${username}\",
            \"email\": \"${email}\",
            \"emailVerified\": true,
            \"enabled\": true,
            \"firstName\": \"${first_name}\",
            \"lastName\": \"${last_name}\",
            \"attributes\": ${attrs}
        }")
    
    if [[ "$http_code" == "201" || "$http_code" == "409" ]]; then
        # Get user ID
        local user_id=$(kc_curl -H "Authorization: Bearer $TOKEN" \
            "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/users?username=${username}" | \
            jq -r '.[0].id')
        
        # Set password
        kc_curl -X PUT "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/users/${user_id}/reset-password" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d "{\"type\": \"password\", \"value\": \"${password}\", \"temporary\": false}"
        
        # Assign dive-user role
        local user_role_id=$(kc_curl -H "Authorization: Bearer $TOKEN" \
            "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/roles/dive-user" | jq -r '.id')
        
        if [[ -n "$user_role_id" && "$user_role_id" != "null" ]]; then
            kc_curl -X POST "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/users/${user_id}/role-mappings/realm" \
                -H "Authorization: Bearer $TOKEN" \
                -H "Content-Type: application/json" \
                -d "[{\"id\": \"${user_role_id}\", \"name\": \"dive-user\"}]"
        fi
        
        # Assign dive-admin role if admin
        if [[ "$is_admin" == "true" ]]; then
            local admin_role_id=$(kc_curl -H "Authorization: Bearer $TOKEN" \
                "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/roles/dive-admin" | jq -r '.id')
            
            if [[ -n "$admin_role_id" && "$admin_role_id" != "null" ]]; then
                kc_curl -X POST "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/users/${user_id}/role-mappings/realm" \
                    -H "Authorization: Bearer $TOKEN" \
                    -H "Content-Type: application/json" \
                    -d "[{\"id\": \"${admin_role_id}\", \"name\": \"dive-admin\"}]"
            fi
        fi
        
        if [[ "$is_admin" == "true" ]]; then
            log_success "Created admin: ${username} (${clearance})"
        else
            log_success "Created: ${username} (${clearance})"
        fi
        return 0
    else
        log_warn "Failed to create: ${username} (HTTP ${http_code})"
        return 1
    fi
}

# =============================================================================
# Create Test Users (Levels 1-4)
# =============================================================================
log_step "Creating test users..."

echo ""
echo "  Creating testuser-${CODE_LOWER}-{1-4} with clearance levels:"
echo ""

for level in 1 2 3 4; do
    username="testuser-${CODE_LOWER}-${level}"
    email="${username}@${CODE_LOWER}.dive25.com"
    clearance="${CLEARANCE_LEVELS[$level]}"
    coi="${CLEARANCE_COIS[$level]}"
    
    # Determine first/last name based on level
    case $level in
        1) first_name="Unclassified"; last_name="User" ;;
        2) first_name="Confidential"; last_name="Analyst" ;;
        3) first_name="Secret"; last_name="Officer" ;;
        4) first_name="TopSecret"; last_name="Director" ;;
    esac
    
    create_user "$username" "$email" "$first_name" "$last_name" "$clearance" "$coi" "$TEST_USER_PASSWORD" "false"
done

# =============================================================================
# Create Admin User
# =============================================================================
echo ""
log_step "Creating admin user..."

admin_username="admin-${CODE_LOWER}"
admin_email="admin@${CODE_LOWER}.dive25.com"

create_user "$admin_username" "$admin_email" "Administrator" "${COUNTRY_NAME}" "TOP_SECRET" "NATO-COSMIC,FVEY,FIVE_EYES" "$ADMIN_USER_PASSWORD" "true"

# =============================================================================
# Summary
# =============================================================================
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                  User Seeding Complete                       ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║                                                              ║${NC}"
echo -e "${GREEN}║  Test Users Created:                                         ║${NC}"
echo -e "${GREEN}║    Username                    Clearance      Password       ║${NC}"
echo -e "${GREEN}║    ─────────────────────────────────────────────────────     ║${NC}"
echo -e "${GREEN}║    testuser-${CODE_LOWER}-1              UNCLASSIFIED   TestUser2025!Pilot  ║${NC}"
echo -e "${GREEN}║    testuser-${CODE_LOWER}-2              CONFIDENTIAL   TestUser2025!Pilot  ║${NC}"
echo -e "${GREEN}║    testuser-${CODE_LOWER}-3              SECRET         TestUser2025!Pilot  ║${NC}"
echo -e "${GREEN}║    testuser-${CODE_LOWER}-4              TOP_SECRET     TestUser2025!Pilot  ║${NC}"
echo -e "${GREEN}║                                                              ║${NC}"
echo -e "${GREEN}║  Admin User Created:                                         ║${NC}"
echo -e "${GREEN}║    admin-${CODE_LOWER}                   TOP_SECRET     TestUser2025!SecureAdmin ║${NC}"
echo -e "${GREEN}║                                                              ║${NC}"
echo -e "${GREEN}║  Roles Assigned:                                             ║${NC}"
echo -e "${GREEN}║    - All users: dive-user                                    ║${NC}"
echo -e "${GREEN}║    - Admin: dive-user + dive-admin                           ║${NC}"
echo -e "${GREEN}║                                                              ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Save credentials to a file for reference
CREDS_FILE="${INSTANCE_DIR}/test-credentials.txt"
if [[ -d "${INSTANCE_DIR}" ]]; then
    cat > "$CREDS_FILE" << EOF
# =============================================================================
# DIVE V3 ${CODE_UPPER} Instance - Test Credentials
# Generated: $(date)
# =============================================================================

## Test Users (Password: TestUser2025!Pilot)

| Username | Clearance | COI |
|----------|-----------|-----|
| testuser-${CODE_LOWER}-1 | UNCLASSIFIED | - |
| testuser-${CODE_LOWER}-2 | CONFIDENTIAL | - |
| testuser-${CODE_LOWER}-3 | SECRET | NATO |
| testuser-${CODE_LOWER}-4 | TOP_SECRET | NATO-COSMIC, FVEY |

## Admin User (Password: TestUser2025!SecureAdmin)

| Username | Clearance | Role |
|----------|-----------|------|
| admin-${CODE_LOWER} | TOP_SECRET | dive-admin |

## Keycloak Admin Console

URL: https://${CODE_LOWER}-idp.dive25.com/admin
Username: admin
Password: (see .env file KEYCLOAK_ADMIN_PASSWORD)

EOF
    log_info "Credentials saved to: ${CREDS_FILE}"
fi

log_info "Next: Run ./scripts/spoke-init/seed-resources.sh ${INSTANCE_CODE}"
