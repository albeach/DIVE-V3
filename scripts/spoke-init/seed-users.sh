#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Spoke User Seeding
# =============================================================================
# Creates standardized test users with proper DIVE attributes and roles
#
# Users Created:
#   - testuser-{country}-1  (UNCLASSIFIED)
#   - testuser-{country}-2  (RESTRICTED)
#   - testuser-{country}-3  (CONFIDENTIAL)
#   - testuser-{country}-4  (SECRET)
#   - testuser-{country}-5  (TOP_SECRET)
#   - admin-{country}       (TOP_SECRET + admin role)
#
# MFA Requirements (NIST 800-63B):
#   - UNCLASSIFIED/RESTRICTED: No MFA required (AAL1)
#   - CONFIDENTIAL/SECRET: TOTP required (AAL2)
#   - TOP_SECRET: WebAuthn required (AAL3)
#
# Note: AMR claims are populated by Keycloak based on actual authentication
# methods used during login. Users must configure TOTP/WebAuthn to access
# classified resources.
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
# New naming pattern: dive-spoke-lva-backend (not lva-backend-lva-1)
PROJECT_PREFIX="dive-spoke-${CODE_LOWER}"
API_CONTAINER="dive-spoke-${CODE_LOWER}-backend"
KEYCLOAK_CONTAINER="dive-spoke-${CODE_LOWER}-keycloak"
KEYCLOAK_INTERNAL_URL="https://dive-spoke-${CODE_LOWER}-keycloak:8443"
PUBLIC_KEYCLOAK_URL="${PUBLIC_KEYCLOAK_URL:-https://${CODE_LOWER}-idp.dive25.com}"

# Get admin password from instance-specific variable or container environment
INSTANCE_PASSWORD_VAR="KEYCLOAK_ADMIN_PASSWORD_${CODE_UPPER}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-${!INSTANCE_PASSWORD_VAR:-}}"
if [[ -z "$ADMIN_PASSWORD" ]]; then
    # Try to get from the running Keycloak container
    ADMIN_PASSWORD=$(docker exec "$KEYCLOAK_CONTAINER" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null || echo "")
fi
if [[ -z "$ADMIN_PASSWORD" ]]; then
    ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-admin}"
fi

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
# Level 2 = RESTRICTED
# Level 3 = CONFIDENTIAL
# Level 4 = SECRET
# Level 5 = TOP_SECRET

map_clearance_level() {
    case "$1" in
        1) echo "UNCLASSIFIED" ;;
        2) echo "RESTRICTED" ;;
        3) echo "CONFIDENTIAL" ;;
        4) echo "SECRET" ;;
        5) echo "TOP_SECRET" ;;
        *) echo "UNCLASSIFIED" ;;
    esac
}

map_clearance_coi() {
    case "$1" in
        1) echo "" ;;
        2) echo "" ;;
        3) echo "" ;;
        4) echo "NATO" ;;
        5) echo "NATO-COSMIC,FVEY" ;;
        *) echo "" ;;
    esac
}

# =============================================================================
# OCEAN-THEMED PSEUDONYM GENERATOR (ACP-240 PII Minimization)
# =============================================================================
# Deterministic pseudonym generation aligned with frontend implementation
# (frontend/src/lib/pseudonym-generator.ts)
#
# Purpose: Generate human-friendly, privacy-preserving pseudonyms instead of
# real names or clearance-based identifiers.
#
# Properties:
# - Deterministic: Same uniqueID always generates same pseudonym
# - Human-friendly: Easy to remember ("Azure Whale", "Golden Dolphin")
# - Collision-resistant: 36 × 36 = 1,296 unique combinations
# - Privacy-preserving: No PII exposure in logs, UI, or federation tokens
#
# Date: January 3, 2026
# Compliance: ACP-240 Section 6.2, NIST SP 800-53 (IA-4)
# =============================================================================

# Ocean-themed adjectives (36 total - matches frontend)
OCEAN_ADJECTIVES=(
    "Azure" "Blue" "Cerulean" "Deep" "Electric" "Frosted"
    "Golden" "Jade" "Midnight" "Pacific" "Royal" "Sapphire"
    "Teal" "Turquoise" "Coral" "Pearl" "Silver" "Arctic"
    "Crystalline" "Emerald" "Indigo" "Obsidian" "Platinum" "Violet"
    "Aquamarine" "Bronze" "Cobalt" "Diamond" "Ebony" "Fuchsia"
    "Garnet" "Honey" "Ivory" "Jasper" "Kyanite" "Lavender"
)

# Ocean-themed nouns (36 total - matches frontend)
OCEAN_NOUNS=(
    "Whale" "Dolphin" "Orca" "Marlin" "Shark" "Ray"
    "Reef" "Current" "Wave" "Tide" "Storm" "Breeze"
    "Kelp" "Anemone" "Starfish" "Octopus" "Nautilus" "Turtle"
    "Lagoon" "Atoll" "Channel" "Harbor" "Bay" "Strait"
    "Jellyfish" "Seahorse" "Manta" "Barracuda" "Angelfish" "Clownfish"
    "Eel" "Grouper" "Lobster" "Manatee" "Narwhal" "Pufferfish"
)

##
# Generate deterministic ocean-themed pseudonym from uniqueID
#
# Arguments:
#   $1 - uniqueID (username/UUID)
#
# Returns:
#   Two words (firstName lastName) separated by space
#   Example: "Azure Whale"
#
# Algorithm:
#   - Hash uniqueID using simple character-based accumulation
#   - Use hash modulo to select adjective and noun deterministically
#   - Same uniqueID always produces same pseudonym
#   - Matches frontend implementation for consistency
##
generate_ocean_pseudonym() {
    local unique_id="$1"

    if [[ -z "$unique_id" ]]; then
        echo "Unknown User"
        return 1
    fi

    # Simple deterministic hash (matches frontend algorithm)
    local hash=0
    for (( i=0; i<${#unique_id}; i++ )); do
        local char_code=$(printf '%d' "'${unique_id:$i:1}")
        # Equivalent to: hash = ((hash << 5) - hash) + char_code
        hash=$(( ((hash * 31) + char_code) & 0x7FFFFFFF )) # Keep positive
    done

    # Select adjective and noun using different hash portions
    local adj_idx=$((hash % 36))
    local noun_idx=$(((hash / 256) % 36))  # Use different bits for noun

    local adjective="${OCEAN_ADJECTIVES[$adj_idx]}"
    local noun="${OCEAN_NOUNS[$noun_idx]}"

    echo "${adjective} ${noun}"
}

# Explicit lookup tables for clearance/COI so attributes are never blank
declare -A CLEARANCE_LEVELS=(
    [1]="UNCLASSIFIED"
    [2]="CONFIDENTIAL"
    [3]="SECRET"
    [4]="TOP_SECRET"
)

declare -A CLEARANCE_COIS=(
    [1]=""
    [2]=""
    [3]="NATO"
    [4]="NATO-COSMIC,FVEY"
)

# Convert comma-separated COI string into a JSON array, trimming whitespace
build_json_array() {
    local raw="$1"
    if [[ -z "$raw" ]]; then
        echo ""
        return
    fi

    local items=()
    IFS=',' read -ra parts <<<"$raw"
    for part in "${parts[@]}"; do
        local trimmed
        trimmed="$(echo "$part" | xargs)"
        if [[ -n "$trimmed" ]]; then
            items+=("\"${trimmed}\"")
        fi
    done

    if [[ ${#items[@]} -eq 0 ]]; then
        echo ""
    else
        local joined
        IFS=','; joined="${items[*]}"; unset IFS
        echo "[${joined}]"
    fi
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

if [[ ! "$EXISTING_ATTRS" =~ "clearance" ]] || [[ ! "$EXISTING_ATTRS" =~ "amr" ]]; then
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
            {"name":"acpCOI","displayName":"Community of Interest","permissions":{"view":["admin","user"],"edit":["admin"]},"multivalued":true},
            {"name":"amr","displayName":"Authentication Methods","permissions":{"view":["admin"],"edit":["admin"]},"multivalued":true}
          ],
          "groups":[{"name":"user-metadata","displayHeader":"User metadata","displayDescription":"Attributes, which refer to user metadata"},{"name":"dive-attributes","displayHeader":"DIVE Attributes","displayDescription":"Security clearance and coalition attributes"}]
        }' > /dev/null 2>&1
    log_success "DIVE attributes added to User Profile"
else
    log_info "User Profile already configured"
fi

# =============================================================================
# Create Roles (Spoke-specific: spoke_admin)
# =============================================================================
log_step "Creating roles..."

# Role definitions with descriptions
declare -A ROLE_DESCRIPTIONS=(
    ["dive-user"]="Standard DIVE user role"
    ["dive-admin"]="Legacy DIVE administrator (backwards compatibility)"
    ["spoke_admin"]="Spoke administrator - read-only federation view, local admin"
)

for role in "dive-user" "dive-admin" "spoke_admin"; do
    ROLE_EXISTS=$(kc_curl -H "Authorization: Bearer $TOKEN" \
        "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/roles/${role}" | jq -r '.name // empty')

    if [[ -z "$ROLE_EXISTS" ]]; then
        kc_curl -X POST "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/roles" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d "{\"name\": \"${role}\", \"description\": \"${ROLE_DESCRIPTIONS[$role]}\"}" 2>/dev/null
        log_success "Created role: $role"
    else
        log_info "Role exists: $role"
    fi
done

# =============================================================================
# Create Role Mapper for Client
# =============================================================================
log_step "Creating role mapper for client..."

CLIENT_ID="dive-v3-broker-${CODE_LOWER}"
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

    # Create admin_role protocol mapper (for JWT claims)
    log_step "Configuring admin_role mapper..."

    ADMIN_ROLE_MAPPER_EXISTS=$(kc_curl -H "Authorization: Bearer $TOKEN" \
        "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}/protocol-mappers/models" | \
        jq -r '.[] | select(.name == "admin_role") | .name')

    if [[ -z "$ADMIN_ROLE_MAPPER_EXISTS" ]]; then
        kc_curl -X POST "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}/protocol-mappers/models" \
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

    # Configure native oidc-amr-mapper (reads from authentication session)
    log_step "Configuring native AMR mapper..."

    # Remove existing AMR mappers (broken user-attribute ones)
    for mapper_id in $(kc_curl -H "Authorization: Bearer $TOKEN" \
        "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}/protocol-mappers/models" | \
        jq -r '.[] | select(.name | contains("amr")) | .id'); do
        kc_curl -X DELETE "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}/protocol-mappers/models/${mapper_id}" \
            -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1
    done

    # Create AMR mapper (user attribute based - reads from user.attributes.amr)
    # This is set based on user's configured credentials (pwd, otp, hwk)
    AMR_MAPPER=$(kc_curl -H "Authorization: Bearer $TOKEN" \
        "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}/protocol-mappers/models" | \
        jq -r '.[] | select(.name | contains("amr")) | .name')

    if [[ -z "$AMR_MAPPER" ]]; then
        kc_curl -X POST "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}/protocol-mappers/models" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d '{
                "name": "amr (credential-based)",
                "protocol": "openid-connect",
                "protocolMapper": "oidc-usermodel-attribute-mapper",
                "consentRequired": false,
                "config": {
                    "introspection.token.claim": "true",
                    "userinfo.token.claim": "true",
                    "user.attribute": "amr",
                    "id.token.claim": "true",
                    "access.token.claim": "true",
                    "claim.name": "amr",
                    "jsonType.label": "String",
                    "multivalued": "true"
                }
            }' > /dev/null 2>&1
        log_success "AMR mapper configured (credential-based)"
    else
        log_info "AMR mapper already exists"
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
    local acp_coi_json
    acp_coi_json=$(build_json_array "$coi")

    # Check if user exists
    local user_exists=$(kc_curl -H "Authorization: Bearer $TOKEN" \
        "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/users?username=${username}" | \
        jq -r '.[0].id // empty')

    if [[ -n "$user_exists" ]]; then
        # Get user's credentials to determine AMR
        local creds=$(kc_curl -H "Authorization: Bearer $TOKEN" \
            "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/users/${user_exists}/credentials")
        local has_pwd=$(echo "$creds" | jq 'any(.[]; .type == "password")')
        local has_otp=$(echo "$creds" | jq 'any(.[]; .type == "otp")')
        local has_webauthn=$(echo "$creds" | jq 'any(.[]; .type == "webauthn" or .type == "webauthn-passwordless")')

        # Build AMR array based on credentials AND clearance requirements
        # TOP_SECRET requires AAL3 (WebAuthn), CONFIDENTIAL/SECRET require AAL2 (TOTP)
        local amr='["pwd"'
        if [[ "$clearance" == "TOP_SECRET" ]]; then
            # TOP_SECRET: require hwk (WebAuthn) - set by requirement
            amr="${amr},\"hwk\""
        elif [[ "$clearance" == "SECRET" ]] || [[ "$clearance" == "CONFIDENTIAL" ]]; then
            # CONFIDENTIAL/SECRET: add otp if has it
            [[ "$has_otp" == "true" ]] && amr="${amr},\"otp\""
            [[ "$has_webauthn" == "true" ]] && amr="${amr},\"hwk\""
        else
            # UNCLASSIFIED: only add methods actually configured
            [[ "$has_otp" == "true" ]] && amr="${amr},\"otp\""
            [[ "$has_webauthn" == "true" ]] && amr="${amr},\"hwk\""
        fi
        amr="${amr}]"

        log_info "User exists: ${username} (updating with amr=${amr})"
        # Update attributes on existing user with credential-based AMR
        # FIX: Remove -001 suffix for ACP-240 PII minimization (uniqueID = username)
        local attrs_update="{\"clearance\": [\"${clearance}\"], \"countryOfAffiliation\": [\"${CODE_UPPER}\"], \"uniqueID\": [\"${username}\"], \"amr\": ${amr}"
        if [[ -n "$acp_coi_json" ]]; then
            attrs_update="${attrs_update}, \"acpCOI\": ${acp_coi_json}"
        fi
        attrs_update="${attrs_update}}"
        kc_curl -X PUT "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/users/${user_exists}" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d "{
                \"email\": \"${email}\",
                \"emailVerified\": true,
                \"firstName\": \"${first_name}\",
                \"lastName\": \"${last_name}\",
                \"attributes\": ${attrs_update}
            }" >/dev/null 2>&1 || true
        return 0
    fi

    # Determine initial AMR based on clearance requirements
    # TOP_SECRET gets hwk (will need to configure WebAuthn)
    # CONFIDENTIAL/SECRET start with pwd only (will need to configure TOTP)
    local initial_amr='["pwd"]'
    if [[ "$clearance" == "TOP_SECRET" ]]; then
        initial_amr='["pwd","hwk"]'
    fi

    # Build attributes JSON
    # FIX: Remove -001 suffix for ACP-240 PII minimization (uniqueID = username)
    local attrs="{\"clearance\": [\"${clearance}\"], \"countryOfAffiliation\": [\"${CODE_UPPER}\"], \"uniqueID\": [\"${username}\"], \"amr\": ${initial_amr}"
    if [[ -n "$acp_coi_json" ]]; then
        attrs="${attrs}, \"acpCOI\": ${acp_coi_json}"
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

        # Assign admin roles if admin (spoke gets spoke_admin + dive-admin for backwards compat)
        if [[ "$is_admin" == "true" ]]; then
            # Assign spoke_admin role (new role for spoke administrators)
            local spoke_admin_role_id=$(kc_curl -H "Authorization: Bearer $TOKEN" \
                "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/roles/spoke_admin" | jq -r '.id')

            if [[ -n "$spoke_admin_role_id" && "$spoke_admin_role_id" != "null" ]]; then
                kc_curl -X POST "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/users/${user_id}/role-mappings/realm" \
                    -H "Authorization: Bearer $TOKEN" \
                    -H "Content-Type: application/json" \
                    -d "[{\"id\": \"${spoke_admin_role_id}\", \"name\": \"spoke_admin\"}]"
            fi

            # Also assign dive-admin for backwards compatibility
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
            log_success "Created admin: ${username} (${clearance}, amr=${initial_amr})"
        else
            log_success "Created: ${username} (${clearance}, amr=${initial_amr})"
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
echo "  Creating testuser-${CODE_LOWER}-{1-5} with clearance levels:"
echo ""

for level in 1 2 3 4 5; do
    username="testuser-${CODE_LOWER}-${level}"
    # FIX #3: Make email optional for ACP-240 PII minimization
    # Email is NOT required for federation (only uniqueID, clearance, COA, COI)
    # Set to empty string unless user provides real email (future enhancement)
    email=""
    clearance="${CLEARANCE_LEVELS[$level]}"
    if [[ -z "$clearance" ]]; then
        clearance="$(map_clearance_level "$level")"
    fi
    coi="${CLEARANCE_COIS[$level]}"
    if [[ -z "$coi" ]]; then
        coi="$(map_clearance_coi "$level")"
    fi

    # FIX #2: Generate ocean-themed pseudonym (replaces clearance-based names)
    # Deterministic: same username always generates same pseudonym
    # Example: "Azure Whale", "Golden Dolphin", "Cerulean Reef"
    # Matches frontend pseudonym-generator.ts for consistency
    read first_name last_name < <(generate_ocean_pseudonym "$username")

    # Fallback if generation fails (should never happen)
    if [[ -z "$first_name" || -z "$last_name" ]]; then
        first_name="Ocean"
        last_name="User"
    fi

    create_user "$username" "$email" "$first_name" "$last_name" "$clearance" "$coi" "$TEST_USER_PASSWORD" "false"
done

# =============================================================================
# Create Admin User
# =============================================================================
echo ""
log_step "Creating admin user..."

admin_username="admin-${CODE_LOWER}"
# FIX #3: Make email optional for ACP-240 PII minimization
admin_email=""

# FIX #2: Generate ocean-themed pseudonym for admin
read admin_first_name admin_last_name < <(generate_ocean_pseudonym "$admin_username")

# Fallback if generation fails
if [[ -z "$admin_first_name" || -z "$admin_last_name" ]]; then
    admin_first_name="Admin"
    admin_last_name="${COUNTRY_NAME}"
fi

create_user "$admin_username" "$admin_email" "$admin_first_name" "$admin_last_name" "TOP_SECRET" "NATO-COSMIC,FVEY,FIVE_EYES" "$ADMIN_USER_PASSWORD" "true"

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
echo -e "${GREEN}║    testuser-${CODE_LOWER}-2              RESTRICTED     TestUser2025!Pilot  ║${NC}"
echo -e "${GREEN}║    testuser-${CODE_LOWER}-3              CONFIDENTIAL   TestUser2025!Pilot  ║${NC}"
echo -e "${GREEN}║    testuser-${CODE_LOWER}-4              SECRET         TestUser2025!Pilot  ║${NC}"
echo -e "${GREEN}║    testuser-${CODE_LOWER}-5              TOP_SECRET     TestUser2025!Pilot  ║${NC}"
echo -e "${GREEN}║                                                              ║${NC}"
echo -e "${GREEN}║  Admin User Created:                                         ║${NC}"
echo -e "${GREEN}║    admin-${CODE_LOWER}                   TOP_SECRET     TestUser2025!SecureAdmin ║${NC}"
echo -e "${GREEN}║                                                              ║${NC}"
echo -e "${GREEN}║  Roles Assigned:                                             ║${NC}"
echo -e "${GREEN}║    - All users: dive-user                                    ║${NC}"
echo -e "${GREEN}║    - Admin: dive-user + dive-admin                           ║${NC}"
echo -e "${GREEN}║                                                              ║${NC}"
echo -e "${GREEN}║  MFA Requirements (NIST 800-63B):                            ║${NC}"
echo -e "${GREEN}║    - UNCLASSIFIED/RESTRICTED: No MFA (AAL1)                  ║${NC}"
echo -e "${GREEN}║    - CONFIDENTIAL/SECRET: TOTP (AAL2)                        ║${NC}"
echo -e "${GREEN}║    - TOP_SECRET: WebAuthn (AAL3)                             ║${NC}"
echo -e "${GREEN}║                                                              ║${NC}"
echo -e "${GREEN}║  Note: Users must configure MFA to access classified docs.   ║${NC}"
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
| testuser-${CODE_LOWER}-2 | RESTRICTED | - |
| testuser-${CODE_LOWER}-3 | CONFIDENTIAL | - |
| testuser-${CODE_LOWER}-4 | SECRET | NATO |
| testuser-${CODE_LOWER}-5 | TOP_SECRET | NATO-COSMIC, FVEY |

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

log_info "Next: Seed ZTDF resources via: ./dive spoke seed ${INSTANCE_CODE}"
