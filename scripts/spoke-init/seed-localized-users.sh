#!/usr/bin/env bash
##
# Seed users with localized attributes for a NATO spoke
# Uses country-specific attribute names from nato-attribute-mappings.json
#
# PILOT STANDARD v2.0 (with RESTRICTED clearance):
#   - 5 users per instance with predictable naming
#   - Format: testuser-{code}-{level}
#   - Level 1-5 corresponds to clearance (higher = more access)
#   - Single password for all: TestUser2025!Pilot
#
# Quick Reference:
#   testuser-{code}-1 → UNCLASSIFIED  (AAL1)
#   testuser-{code}-2 → RESTRICTED    (AAL1)
#   testuser-{code}-3 → CONFIDENTIAL  (AAL2 - MFA)
#   testuser-{code}-4 → SECRET        (AAL2 - MFA)
#   testuser-{code}-5 → TOP_SECRET    (AAL3 - MFA + HW)
#
# Usage: ./seed-localized-users.sh <COUNTRY_CODE>
# Example: ./seed-localized-users.sh HUN
##

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MAPPINGS_FILE="${PROJECT_ROOT}/keycloak/mapper-templates/nato-attribute-mappings.json"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

log_info() { echo -e "${BLUE}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }

# Check arguments
if [ -z "$1" ]; then
    echo -e "${BOLD}Usage:${NC} $0 <COUNTRY_CODE>"
    echo ""
    echo "Available NATO countries:"
    jq -r '.countries | keys[]' "$MAPPINGS_FILE" | sort | xargs -n8 | sed 's/^/  /'
    exit 1
fi

COUNTRY_CODE=$(echo "$1" | tr '[:lower:]' '[:upper:]')
COUNTRY_LOWER=$(echo "$COUNTRY_CODE" | tr '[:upper:]' '[:lower:]')

# Check if country exists in mappings
if ! jq -e ".countries.${COUNTRY_CODE}" "$MAPPINGS_FILE" > /dev/null 2>&1; then
    log_error "Country code ${COUNTRY_CODE} not found in NATO mappings"
    exit 1
fi

# Get country info
COUNTRY_NAME=$(jq -r ".countries.${COUNTRY_CODE}.name" "$MAPPINGS_FILE")
COUNTRY_LANG=$(jq -r ".countries.${COUNTRY_CODE}.language" "$MAPPINGS_FILE")

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║  Seeding Users with Localized Attributes for ${COUNTRY_NAME}${NC}"
echo -e "${BOLD}║  Version 2.0 - 5-Level Clearance System with RESTRICTED${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Determine Keycloak container and port (new naming pattern: dive-spoke-lva-keycloak)
KEYCLOAK_CONTAINER="dive-spoke-${COUNTRY_LOWER}-keycloak"
KEYCLOAK_PORT=$(docker port "$KEYCLOAK_CONTAINER" 8443 2>/dev/null | cut -d: -f2 || echo "8443")
REALM="dive-v3-broker-${COUNTRY_LOWER}"
KEYCLOAK_URL="https://localhost:${KEYCLOAK_PORT}"

# Check if container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${KEYCLOAK_CONTAINER}$"; then
    log_error "Keycloak container ${KEYCLOAK_CONTAINER} is not running"
    exit 1
fi

log_info "Keycloak: ${KEYCLOAK_URL}"
log_info "Realm: ${REALM}"
echo ""

# Get admin token
ADMIN_PASSWORD=$(docker exec "$KEYCLOAK_CONTAINER" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null || echo "admin")
TOKEN=$(curl -sk -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
    -d "grant_type=password" \
    -d "client_id=admin-cli" \
    -d "username=admin" \
    -d "password=${ADMIN_PASSWORD}" | jq -r '.access_token')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
    log_error "Failed to get admin token"
    exit 1
fi

# Get localized attribute names
LOCAL_CLEARANCE=$(jq -r ".countries.${COUNTRY_CODE}.attributes | to_entries | .[] | select(.value==\"clearance\") | .key" "$MAPPINGS_FILE")
LOCAL_COUNTRY=$(jq -r ".countries.${COUNTRY_CODE}.attributes | to_entries | .[] | select(.value==\"countryOfAffiliation\") | .key" "$MAPPINGS_FILE")
LOCAL_UNIQUEID=$(jq -r ".countries.${COUNTRY_CODE}.attributes | to_entries | .[] | select(.value==\"uniqueID\") | .key" "$MAPPINGS_FILE")
LOCAL_COI=$(jq -r ".countries.${COUNTRY_CODE}.attributes | to_entries | .[] | select(.value==\"acpCOI\") | .key" "$MAPPINGS_FILE")

# Get localized clearance values (all 5 levels)
CLEARANCE_UNCLASS=$(jq -r ".countries.${COUNTRY_CODE}.clearance_values | to_entries | .[] | select(.value==\"UNCLASSIFIED\") | .key" "$MAPPINGS_FILE")
CLEARANCE_RESTRICT=$(jq -r ".countries.${COUNTRY_CODE}.clearance_values | to_entries | .[] | select(.value==\"RESTRICTED\") | .key" "$MAPPINGS_FILE")
CLEARANCE_CONF=$(jq -r ".countries.${COUNTRY_CODE}.clearance_values | to_entries | .[] | select(.value==\"CONFIDENTIAL\") | .key" "$MAPPINGS_FILE")
CLEARANCE_SECRET=$(jq -r ".countries.${COUNTRY_CODE}.clearance_values | to_entries | .[] | select(.value==\"SECRET\") | .key" "$MAPPINGS_FILE")
CLEARANCE_TS=$(jq -r ".countries.${COUNTRY_CODE}.clearance_values | to_entries | .[] | select(.value==\"TOP_SECRET\") | .key" "$MAPPINGS_FILE")

echo "Localized attribute names:"
echo "  ${LOCAL_CLEARANCE} (clearance)"
echo "  ${LOCAL_COUNTRY} (countryOfAffiliation)"
echo "  ${LOCAL_UNIQUEID} (uniqueID)"
echo "  ${LOCAL_COI} (acpCOI)"
echo ""
echo "Localized clearance values (5-level system):"
echo "  ${CLEARANCE_UNCLASS} = UNCLASSIFIED (AAL1)"
echo "  ${CLEARANCE_RESTRICT} = RESTRICTED (AAL1)"
echo "  ${CLEARANCE_CONF} = CONFIDENTIAL (AAL2 - MFA)"
echo "  ${CLEARANCE_SECRET} = SECRET (AAL2 - MFA)"
echo "  ${CLEARANCE_TS} = TOP_SECRET (AAL3 - MFA + HW)"
echo ""

# Ocean-themed adjectives and nouns for pseudonyms
OCEAN_ADJECTIVES=("Azure" "Blue" "Cerulean" "Deep" "Electric" "Frosted" "Golden" "Jade" "Midnight" "Pacific" "Royal" "Sapphire" "Teal" "Turquoise" "Coral" "Pearl" "Silver" "Arctic")
OCEAN_NOUNS=("Whale" "Dolphin" "Orca" "Marlin" "Shark" "Ray" "Reef" "Current" "Wave" "Tide" "Storm" "Breeze" "Kelp" "Anemone" "Starfish" "Octopus" "Nautilus" "Turtle")

# Generate deterministic pseudonym from username
generate_pseudonym() {
    local username="$1"
    local hash=$(echo -n "$username" | md5sum | cut -c1-8)
    local adj_idx=$((16#${hash:0:4} % ${#OCEAN_ADJECTIVES[@]}))
    local noun_idx=$((16#${hash:4:4} % ${#OCEAN_NOUNS[@]}))
    echo "${OCEAN_ADJECTIVES[$adj_idx]} ${OCEAN_NOUNS[$noun_idx]}"
}

# Define users to create (using indexed array for bash compatibility)
# Updated: 5 users with RESTRICTED as level 2
USERS=("testuser-${COUNTRY_LOWER}-1:${CLEARANCE_UNCLASS}:1"
       "testuser-${COUNTRY_LOWER}-2:${CLEARANCE_RESTRICT}:1"
       "testuser-${COUNTRY_LOWER}-3:${CLEARANCE_CONF}:2"
       "testuser-${COUNTRY_LOWER}-4:${CLEARANCE_SECRET}:2"
       "testuser-${COUNTRY_LOWER}-5:${CLEARANCE_TS}:3"
       "admin-${COUNTRY_LOWER}:${CLEARANCE_TS}:3")

PASSWORD="TestUser2025!Pilot"

create_or_update_user() {
    local username="$1"
    local clearance_val="$2"
    local aal_level="$3"
    local is_admin="${4:-false}"

    # Check if user exists
    local user_id=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM}/users?username=${username}" \
        -H "Authorization: Bearer $TOKEN" | jq -r '.[0].id // empty')

    # FIX: uniqueID = username (no suffix) for ACP-240 PII minimization
    local unique_id="${username}"

    # PII Minimization: Use pseudonymized email and names
    local pseudonym=$(generate_pseudonym "${username}")
    local firstname=$(echo "$pseudonym" | cut -d' ' -f1)
    local lastname=$(echo "$pseudonym" | cut -d' ' -f2)
    local hash=$(echo -n "${username}-${COUNTRY_CODE}" | md5sum | cut -c1-8)
    local email="${hash}@pseudonym.dive25.mil"

    # Determine AMR based on AAL level
    local amr_val='["pwd"]'
    if [ "$aal_level" = "2" ]; then
        amr_val='["pwd","otp"]'
    elif [ "$aal_level" = "3" ]; then
        amr_val='["pwd","hwk"]'
    fi

    # Determine user type and roles
    local user_type="military"
    local dive_roles='["user"]'
    if [ "$is_admin" = "true" ]; then
        user_type="admin"
        dive_roles='["user","admin","super_admin"]'
    fi

    # Build user JSON with localized attributes
    # Note: requiredActions=[] prevents the Verify Profile form from showing
    local user_json=$(cat <<EOF
{
    "username": "${username}",
    "email": "${email}",
    "emailVerified": true,
    "enabled": true,
    "firstName": "${firstname}",
    "lastName": "${lastname}",
    "requiredActions": [],
    "attributes": {
        "${LOCAL_CLEARANCE}": ["${clearance_val}"],
        "${LOCAL_COUNTRY}": ["${COUNTRY_CODE}"],
        "${LOCAL_UNIQUEID}": ["${unique_id}"],
        "${LOCAL_COI}": ["NATO"],
        "amr": ${amr_val},
        "aal_level": ["${aal_level}"],
        "userType": ["${user_type}"],
        "dive_roles": ${dive_roles},
        "pilot_user": ["true"],
        "created_by": ["seed-script"]
    },
    "credentials": [{
        "type": "password",
        "value": "${PASSWORD}",
        "temporary": false
    }]
}
EOF
)

    if [ -n "$user_id" ]; then
        # Update existing user
        curl -sk -X PUT "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${user_id}" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d "$user_json" > /dev/null
        log_success "Updated: ${username} (${clearance_val}, AAL${aal_level}) → ${pseudonym}"
    else
        # Create new user
        curl -sk -X POST "${KEYCLOAK_URL}/admin/realms/${REALM}/users" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d "$user_json" > /dev/null
        log_success "Created: ${username} (${clearance_val}, AAL${aal_level}) → ${pseudonym}"
    fi
}

echo -e "${BOLD}Creating/updating users with localized attributes...${NC}"
echo ""

for user_data in "${USERS[@]}"; do
    IFS=':' read -r username clearance aal_level <<< "$user_data"
    is_admin="false"
    if [[ "$username" == admin-* ]]; then
        is_admin="true"
    fi
    create_or_update_user "$username" "$clearance" "$aal_level" "$is_admin"
done

echo ""
echo -e "${BOLD}Verifying users...${NC}"

for user_data in "${USERS[@]}"; do
    IFS=':' read -r username clearance aal_level <<< "$user_data"
    USER_DATA=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM}/users?username=${username}" \
        -H "Authorization: Bearer $TOKEN" | jq -r ".[0].attributes.${LOCAL_CLEARANCE}[0] // \"NOT_SET\"")
    echo "  ${username}: ${LOCAL_CLEARANCE}=${USER_DATA}"
done

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Users seeded with localized ${COUNTRY_NAME} attributes!${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Test logins (5-level clearance system):"
echo "  testuser-${COUNTRY_LOWER}-1 / ${PASSWORD}  (${CLEARANCE_UNCLASS} - UNCLASSIFIED, AAL1)"
echo "  testuser-${COUNTRY_LOWER}-2 / ${PASSWORD}  (${CLEARANCE_RESTRICT} - RESTRICTED, AAL1)"
echo "  testuser-${COUNTRY_LOWER}-3 / ${PASSWORD}  (${CLEARANCE_CONF} - CONFIDENTIAL, AAL2)"
echo "  testuser-${COUNTRY_LOWER}-4 / ${PASSWORD}  (${CLEARANCE_SECRET} - SECRET, AAL2)"
echo "  testuser-${COUNTRY_LOWER}-5 / ${PASSWORD}  (${CLEARANCE_TS} - TOP_SECRET, AAL3)"
echo "  admin-${COUNTRY_LOWER} / ${PASSWORD}  (${CLEARANCE_TS} - ADMIN, AAL3)"
