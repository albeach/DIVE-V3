#!/usr/bin/env bash
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
#   4. Configures native oidc-amr-mapper for MFA claims (reads from auth session)
#
# MFA Note: AMR claims are populated by Keycloak based on ACTUAL authentication
# methods used during login (pwd, otp, hwk). Users must configure TOTP/WebAuthn
# to access CONFIDENTIAL+ resources.
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
REALM_NAME="${REALM_NAME:-dive-v3-broker-usa}"
CLIENT_ID="${CLIENT_ID:-dive-v3-broker-usa}"
ADMIN_USER="${KEYCLOAK_ADMIN:-admin}"
ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-}"
TEST_USER_PASSWORD="${TEST_USER_PASSWORD:-TestUser2025!Pilot}"
ADMIN_USER_PASSWORD="${ADMIN_USER_PASSWORD:-TestUser2025!SecureAdmin}"

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
# CRITICAL: DIVE attributes MUST have "view":["admin","user"] to be included
# in tokens during federation. This is a Keycloak 26+ requirement.
# We ALWAYS update the profile to ensure permissions are correct.
log_step "Configuring User Profile for DIVE attributes..."

# Always update the User Profile to ensure correct permissions
# Keycloak 26+ restricts token claims based on User Profile view permissions
curl -sk -X PUT "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/users/profile" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "attributes": [
        {"name":"username","displayName":"${username}","validations":{"length":{"min":3,"max":255},"username-prohibited-characters":{},"up-username-not-idn-homograph":{}},"permissions":{"view":["admin","user"],"edit":["admin","user"]},"multivalued":false},
        {"name":"email","displayName":"${email}","validations":{"email":{},"length":{"max":255}},"permissions":{"view":["admin","user"],"edit":["admin","user"]},"multivalued":false},
        {"name":"firstName","displayName":"${firstName}","validations":{"length":{"max":255},"person-name-prohibited-characters":{}},"permissions":{"view":["admin","user"],"edit":["admin","user"]},"multivalued":false},
        {"name":"lastName","displayName":"${lastName}","validations":{"length":{"max":255},"person-name-prohibited-characters":{}},"permissions":{"view":["admin","user"],"edit":["admin"]},"multivalued":false},
        {"name":"clearance","displayName":"Security Clearance","group":"dive-attributes","validations":{"multivalued":{"max":"1"}},"permissions":{"view":["admin","user"],"edit":["admin"]},"multivalued":false},
        {"name":"countryOfAffiliation","displayName":"Country of Affiliation","group":"dive-attributes","validations":{"multivalued":{"max":"1"},"length":{"max":"3","min":"3","ignore.empty.value":true}},"permissions":{"view":["admin","user"],"edit":["admin"]},"multivalued":false},
        {"name":"uniqueID","displayName":"Unique Identifier","group":"dive-attributes","validations":{"multivalued":{"max":"1"},"length":{"max":"255","min":"3","ignore.empty.value":true}},"permissions":{"view":["admin","user"],"edit":["admin"]},"multivalued":false},
        {"name":"acpCOI","displayName":"Community of Interest","group":"dive-attributes","annotations":{"inputType":"multiselect"},"validations":{"length":{"max":"50","min":"0","ignore.empty.value":true}},"permissions":{"view":["admin","user"],"edit":["admin"]},"multivalued":true}
      ],
      "groups":[
        {"name":"user-metadata","displayHeader":"User metadata","displayDescription":"Attributes, which refer to user metadata"},
        {"name":"dive-attributes","displayHeader":"DIVE Attributes","displayDescription":"Security clearance and coalition attributes"}
      ]
    }' > /dev/null 2>&1
log_success "User Profile configured with DIVE attributes (view permissions set for federation)"

# =============================================================================
# Fix Protocol Mappers (acpCOI + native AMR)
# =============================================================================
log_step "Configuring protocol mappers..."

CLIENT_UUID=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients" \
    -H "Authorization: Bearer $TOKEN" | jq -r ".[] | select(.clientId == \"${CLIENT_ID}\") | .id")

if [ -n "$CLIENT_UUID" ] && [ "$CLIENT_UUID" != "null" ]; then
    # Fix acpCOI mapper
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

    # Configure DIVE AMR mapper (derives AMR from ACR)
    # CRITICAL FIX (Jan 2026): Native oidc-amr-mapper does NOT work because:
    # - auth-username-password-form is NOT configurable (cannot set "reference" property)
    # - Therefore "pwd" is never added to AMR, resulting in amr: []
    #
    # Solution: Use dive-amr-protocol-mapper which DERIVES AMR from ACR:
    # - ACR "1" → AMR ["pwd"]           (AAL1: password only)
    # - ACR "2" → AMR ["pwd", "otp"]    (AAL2: password + OTP)
    # - ACR "3" → AMR ["pwd", "hwk"]    (AAL3: password + WebAuthn)
    #
    # First, remove any existing AMR mappers
    for mapper_id in $(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}/protocol-mappers/models" \
        -H "Authorization: Bearer $TOKEN" | jq -r '.[] | select(.name | test("amr|AMR"; "i")) | .id'); do
        curl -sk -X DELETE "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}/protocol-mappers/models/${mapper_id}" \
            -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1
    done

    # Create DIVE AMR mapper (derives AMR from ACR - actually works!)
    AMR_MAPPER=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}/protocol-mappers/models" \
        -H "Authorization: Bearer $TOKEN" | jq -r '.[] | select(.protocolMapper == "dive-amr-protocol-mapper") | .name')

    if [ -z "$AMR_MAPPER" ]; then
        curl -sk -X POST "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}/protocol-mappers/models" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d '{
                "name": "amr (ACR-derived)",
                "protocol": "openid-connect",
                "protocolMapper": "dive-amr-protocol-mapper",
                "consentRequired": false,
                "config": {
                    "introspection.token.claim": "true",
                    "userinfo.token.claim": "true",
                    "id.token.claim": "true",
                    "access.token.claim": "true"
                }
            }' > /dev/null 2>&1
        log_success "AMR mapper configured (dive-amr-protocol-mapper: ACR-derived)"
    else
        log_info "DIVE AMR mapper already exists: $AMR_MAPPER"
    fi
fi

# =============================================================================
# Create Roles (Hub-specific: super_admin, hub_admin)
# =============================================================================
log_step "Creating DIVE roles..."

# Role definitions with descriptions
declare -A ROLE_DESCRIPTIONS=(
    ["dive-user"]="Standard DIVE user role"
    ["dive-admin"]="Legacy DIVE administrator (backwards compatibility)"
    ["super_admin"]="Super administrator with full system access"
    ["hub_admin"]="Hub administrator - can manage federation, spokes, and policies"
)

for role in "dive-user" "dive-admin" "super_admin" "hub_admin"; do
    ROLE_EXISTS=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/roles/${role}" \
        -H "Authorization: Bearer $TOKEN" -o /dev/null -w "%{http_code}")

    if [ "$ROLE_EXISTS" != "200" ]; then
        curl -sk -X POST "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/roles" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d "{\"name\": \"${role}\", \"description\": \"${ROLE_DESCRIPTIONS[$role]}\"}" > /dev/null 2>&1
        log_success "Created role: $role"
    else
        log_info "Role exists: $role"
    fi
done

# =============================================================================
# Create admin_role Protocol Mapper (for JWT claims)
# =============================================================================
log_step "Creating admin_role protocol mapper..."

CLIENT_UUID=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients" \
    -H "Authorization: Bearer $TOKEN" | jq -r ".[] | select(.clientId == \"${CLIENT_ID}\") | .id")

if [ -n "$CLIENT_UUID" ] && [ "$CLIENT_UUID" != "null" ]; then
    # Check if admin_role mapper exists
    MAPPER_EXISTS=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}/protocol-mappers/models" \
        -H "Authorization: Bearer $TOKEN" | jq -r '.[] | select(.name == "admin_role") | .name')

    if [ -z "$MAPPER_EXISTS" ]; then
        curl -sk -X POST "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}/protocol-mappers/models" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d '{
                "name": "admin_role",
                "protocol": "openid-connect",
                "protocolMapper": "oidc-usermodel-realm-role-mapper",
                "consentRequired": false,
                "config": {
                    "introspection.token.claim": "true",
                    "multivalued": "true",
                    "userinfo.token.claim": "true",
                    "id.token.claim": "true",
                    "access.token.claim": "true",
                    "claim.name": "admin_role",
                    "jsonType.label": "String"
                }
            }' > /dev/null 2>&1
        log_success "Created admin_role protocol mapper"
    else
        log_info "admin_role mapper already exists"
    fi
fi

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
        # Get user's credentials to determine AMR
        local creds=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/users/${user_id}/credentials" \
            -H "Authorization: Bearer $TOKEN")
        local has_pwd=$(echo "$creds" | jq 'any(.[]; .type == "password")')
        local has_otp=$(echo "$creds" | jq 'any(.[]; .type == "otp")')
        local has_webauthn=$(echo "$creds" | jq 'any(.[]; .type == "webauthn" or .type == "webauthn-passwordless")')

        # Build AMR array based on credentials AND clearance requirements
        # TOP_SECRET requires AAL3 (WebAuthn), CONFIDENTIAL/SECRET require AAL2 (TOTP)
        # UNCLASSIFIED/RESTRICTED: AAL1 (no MFA required)
        local amr='["pwd"'
        if [ "$clearance" == "TOP_SECRET" ]; then
            # TOP_SECRET: require hwk (WebAuthn) - set if has it OR by requirement
            [ "$has_webauthn" == "true" ] && amr="${amr},\"hwk\"" || amr="${amr},\"hwk\""
        elif [ "$clearance" == "SECRET" ] || [ "$clearance" == "CONFIDENTIAL" ]; then
            # CONFIDENTIAL/SECRET: require otp - set if has it
            [ "$has_otp" == "true" ] && amr="${amr},\"otp\""
            [ "$has_webauthn" == "true" ] && amr="${amr},\"hwk\""
        else
            # UNCLASSIFIED/RESTRICTED: only add methods actually configured (no MFA required)
            [ "$has_otp" == "true" ] && amr="${amr},\"otp\""
            [ "$has_webauthn" == "true" ] && amr="${amr},\"hwk\""
        fi
        amr="${amr}]"

        # Determine AAL level based on clearance
        local aal_level="1"
        if [ "$clearance" == "CONFIDENTIAL" ] || [ "$clearance" == "SECRET" ]; then
            aal_level="2"
        elif [ "$clearance" == "TOP_SECRET" ]; then
            aal_level="3"
        fi

        # Determine dive_roles based on is_admin
        local dive_roles='["user"]'
        if [ "$is_admin" == "true" ]; then
            dive_roles='["user","admin","super_admin"]'
        fi

        # Update existing user with credential-based AMR
        # FIX: uniqueID = username (no -001 suffix) for ACP-240 PII minimization
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
                    \"uniqueID\": [\"${username}\"],
                    \"acpCOI\": ${coi_json},
                    \"amr\": ${amr},
                    \"aal_level\": [\"${aal_level}\"],
                    \"dive_roles\": ${dive_roles},
                    \"pilot_user\": [\"true\"],
                    \"created_by\": [\"seed-script\"]
                }
            }" > /dev/null 2>&1
        log_info "Updated: ${username} (${clearance}, AAL${aal_level}, amr=${amr})"
    else
        # Determine initial AMR based on clearance requirements
        # TOP_SECRET gets hwk (will need to configure WebAuthn)
        # CONFIDENTIAL/SECRET start with pwd only (will need to configure TOTP)
        local initial_amr='["pwd"]'
        local aal_level="1"
        if [ "$clearance" == "CONFIDENTIAL" ] || [ "$clearance" == "SECRET" ]; then
            aal_level="2"
        elif [ "$clearance" == "TOP_SECRET" ]; then
            initial_amr='["pwd","hwk"]'
            aal_level="3"
        fi

        # Determine dive_roles based on is_admin
        local dive_roles='["user"]'
        if [ "$is_admin" == "true" ]; then
            dive_roles='["user","admin","super_admin"]'
        fi

        # Create new user
        # FIX: uniqueID = username (no -001 suffix) for ACP-240 PII minimization
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
                \"requiredActions\": [],
                \"credentials\": [{\"type\": \"password\", \"value\": \"${password}\", \"temporary\": false}],
                \"attributes\": {
                    \"clearance\": [\"${clearance}\"],
                    \"countryOfAffiliation\": [\"USA\"],
                    \"uniqueID\": [\"${username}\"],
                    \"acpCOI\": ${coi_json},
                    \"amr\": ${initial_amr},
                    \"aal_level\": [\"${aal_level}\"],
                    \"dive_roles\": ${dive_roles},
                    \"pilot_user\": [\"true\"],
                    \"created_by\": [\"seed-script\"]
                }
            }" -o /dev/null -w "%{http_code}")

        if [ "$http_code" == "201" ]; then
            log_success "Created: ${username} (${clearance}, amr=${initial_amr})"

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

            # Assign admin roles if admin (hub gets hub_admin + dive-admin for backwards compat)
            if [ "$is_admin" == "true" ]; then
                # Assign hub_admin role (new role for hub administrators)
                local hub_admin_role_id=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/roles/hub_admin" \
                    -H "Authorization: Bearer $TOKEN" | jq -r '.id')
                if [ -n "$hub_admin_role_id" ] && [ "$hub_admin_role_id" != "null" ]; then
                    curl -sk -X POST "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/users/${user_id}/role-mappings/realm" \
                        -H "Authorization: Bearer $TOKEN" \
                        -H "Content-Type: application/json" \
                        -d "[{\"id\": \"${hub_admin_role_id}\", \"name\": \"hub_admin\"}]" > /dev/null 2>&1
                fi

                # Also assign dive-admin for backwards compatibility
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
echo "  Creating testuser-usa-1 through testuser-usa-5 with 5-level clearance system:"
echo "    Level 1: UNCLASSIFIED (AAL1)"
echo "    Level 2: RESTRICTED (AAL1)"
echo "    Level 3: CONFIDENTIAL (AAL2 - MFA)"
echo "    Level 4: SECRET (AAL2 - MFA)"
echo "    Level 5: TOP_SECRET (AAL3 - MFA + HW)"
echo ""

# Ocean-themed pseudonyms for PII minimization (ACP-240 Section 6.2)
# Format: Adjective + Noun (deterministic based on username hash)
OCEAN_ADJECTIVES=("Azure" "Blue" "Cerulean" "Deep" "Electric" "Frosted" "Golden" "Jade" "Midnight" "Pacific" "Royal" "Sapphire" "Teal" "Turquoise" "Coral" "Pearl" "Silver" "Arctic")
OCEAN_NOUNS=("Whale" "Dolphin" "Orca" "Marlin" "Shark" "Ray" "Reef" "Current" "Wave" "Tide" "Storm" "Breeze" "Kelp" "Anemone" "Starfish" "Octopus" "Nautilus" "Turtle")

# Generate deterministic pseudonym from username
generate_pseudonym() {
    local username="$1"
    local hash=$(echo -n "$username" | md5sum | cut -c1-8)
    local adj_idx=$((16#${hash:0:4} % ${#OCEAN_ADJECTIVES[@]}))
    local noun_idx=$((16#${hash:4:4} % ${#OCEAN_NOUNS[@]}))
    echo "${OCEAN_ADJECTIVES[$adj_idx]}:${OCEAN_NOUNS[$noun_idx]}"
}

# Test users with 5-level clearance system
# Now with PII minimization: pseudonymized names and emails
PSEUDO1=$(generate_pseudonym "testuser-usa-1")
PSEUDO2=$(generate_pseudonym "testuser-usa-2")
PSEUDO3=$(generate_pseudonym "testuser-usa-3")
PSEUDO4=$(generate_pseudonym "testuser-usa-4")
PSEUDO5=$(generate_pseudonym "testuser-usa-5")
PSEUDO_ADMIN=$(generate_pseudonym "admin-usa")

# Generate pseudonymized emails (hash-based)
HASH1=$(echo -n "testuser-usa-1-USA" | md5sum | cut -c1-8)
HASH2=$(echo -n "testuser-usa-2-USA" | md5sum | cut -c1-8)
HASH3=$(echo -n "testuser-usa-3-USA" | md5sum | cut -c1-8)
HASH4=$(echo -n "testuser-usa-4-USA" | md5sum | cut -c1-8)
HASH5=$(echo -n "testuser-usa-5-USA" | md5sum | cut -c1-8)
HASH_ADMIN=$(echo -n "admin-usa-USA" | md5sum | cut -c1-8)

# Create users with pseudonymized PII

create_user "testuser-usa-1" "${HASH1}@pseudonym.dive25.mil" "${PSEUDO1%%:*}" "${PSEUDO1##*:}" "UNCLASSIFIED" "" "$TEST_USER_PASSWORD" "false"
create_user "testuser-usa-2" "${HASH2}@pseudonym.dive25.mil" "${PSEUDO2%%:*}" "${PSEUDO2##*:}" "RESTRICTED" "" "$TEST_USER_PASSWORD" "false"
create_user "testuser-usa-3" "${HASH3}@pseudonym.dive25.mil" "${PSEUDO3%%:*}" "${PSEUDO3##*:}" "CONFIDENTIAL" "" "$TEST_USER_PASSWORD" "false"
create_user "testuser-usa-4" "${HASH4}@pseudonym.dive25.mil" "${PSEUDO4%%:*}" "${PSEUDO4##*:}" "SECRET" "NATO" "$TEST_USER_PASSWORD" "false"
create_user "testuser-usa-5" "${HASH5}@pseudonym.dive25.mil" "${PSEUDO5%%:*}" "${PSEUDO5##*:}" "TOP_SECRET" "NATO,FVEY" "$TEST_USER_PASSWORD" "false"

log_step "Creating admin user..."
# Admin gets TOP_SECRET clearance + broad COI access for bilateral agreements
# COI includes: NATO, FVEY, and all USA bilateral agreements (FRA-US, GBR-US, CAN-US, DEU-US)
# Note: US-ONLY is NOT included (mutually exclusive with bilaterals)
create_user "admin-usa" "${HASH_ADMIN}@admin.dive25.mil" "Commander" "Lighthouse" "TOP_SECRET" "NATO,FVEY,FRA-US,GBR-US,CAN-US,DEU-US" "$ADMIN_USER_PASSWORD" "true"

# =============================================================================
# Verification
# =============================================================================
echo ""
log_step "Verifying user attributes..."

for user in testuser-usa-1 testuser-usa-2 testuser-usa-3 testuser-usa-4 testuser-usa-5 admin-usa; do
    USER_DATA=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/users?username=${user}" \
        -H "Authorization: Bearer $TOKEN" | jq -r '.[0]')
    CLEARANCE=$(echo "$USER_DATA" | jq -r '.attributes.clearance[0] // "MISSING"')
    AAL=$(echo "$USER_DATA" | jq -r '.attributes.aal_level[0] // "?"')
    PSEUDO_FIRST=$(echo "$USER_DATA" | jq -r '.firstName // "?"')
    PSEUDO_LAST=$(echo "$USER_DATA" | jq -r '.lastName // "?"')
    echo "  ${user}: ${CLEARANCE} (AAL${AAL}) → ${PSEUDO_FIRST} ${PSEUDO_LAST}"
done

echo ""
log_success "Hub user seeding complete!"
echo ""
echo "  Test credentials (5-level clearance system):"
echo "    testuser-usa-{1-5}: ${TEST_USER_PASSWORD}"
echo "    admin-usa: ${ADMIN_USER_PASSWORD}"
echo ""
echo "  Clearance Levels (NIST 800-63B / ACP-240):"
echo "    Level 1: UNCLASSIFIED - No MFA (AAL1)"
echo "    Level 2: RESTRICTED   - No MFA (AAL1)"
echo "    Level 3: CONFIDENTIAL - TOTP required (AAL2)"
echo "    Level 4: SECRET       - TOTP required (AAL2)"
echo "    Level 5: TOP_SECRET   - WebAuthn required (AAL3)"
echo ""
echo "  PII Minimization (ACP-240 Section 6.2):"
echo "    - Real names replaced with ocean-themed pseudonyms"
echo "    - uniqueID = username (no suffix)"
echo "    - Emails pseudonymized with hash-based addresses"
echo ""
echo "  Note: Users must configure TOTP/WebAuthn to access classified resources."
echo "        AMR claim is populated by Keycloak based on actual auth methods used."
echo ""
