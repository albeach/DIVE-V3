#!/bin/bash
##
# Configure localized attribute mappers for a NATO spoke
# Maps country-specific attribute names to DIVE V3 standard claims
#
# Usage: ./configure-localized-mappers.sh <COUNTRY_CODE>
# Example: ./configure-localized-mappers.sh HUN
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
echo -e "${BOLD}║  Configuring Localized Mappers for ${COUNTRY_NAME} (${COUNTRY_CODE})${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Language: ${CYAN}${COUNTRY_LANG}${NC}"
echo ""

# Determine Keycloak container and port (new naming pattern: dive-spoke-lva-keycloak)
KEYCLOAK_CONTAINER="dive-spoke-${COUNTRY_LOWER}-keycloak"
if [ "$COUNTRY_CODE" = "USA" ]; then
    KEYCLOAK_CONTAINER="dive-hub-keycloak"
    KEYCLOAK_PORT="8443"
    REALM="dive-v3-broker"
    CLIENT_ID="dive-v3-client-broker"
else
    # Get port from docker inspect or use default pattern
    KEYCLOAK_PORT=$(docker port "$KEYCLOAK_CONTAINER" 8443 2>/dev/null | cut -d: -f2 || echo "8443")
    REALM="dive-v3-broker-${COUNTRY_LOWER}"
    CLIENT_ID="dive-v3-client-${COUNTRY_LOWER}"
fi

KEYCLOAK_URL="https://localhost:${KEYCLOAK_PORT}"

# Check if container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${KEYCLOAK_CONTAINER}$"; then
    log_error "Keycloak container ${KEYCLOAK_CONTAINER} is not running"
    exit 1
fi

log_info "Keycloak URL: ${KEYCLOAK_URL}"
log_info "Realm: ${REALM}"
log_info "Client: ${CLIENT_ID}"
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

# Get client UUID
CLIENT_UUID=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM}/clients?clientId=${CLIENT_ID}" \
    -H "Authorization: Bearer $TOKEN" | jq -r '.[0].id')

if [ -z "$CLIENT_UUID" ] || [ "$CLIENT_UUID" = "null" ]; then
    log_error "Client ${CLIENT_ID} not found"
    exit 1
fi

log_info "Client UUID: ${CLIENT_UUID}"
echo ""

# Get attribute mappings for this country
echo -e "${BOLD}Step 1: Adding localized attributes to User Profile${NC}"

# Get current user profile
CURRENT_PROFILE=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM}/users/profile" \
    -H "Authorization: Bearer $TOKEN")

# Get localized attribute names
LOCAL_CLEARANCE=$(jq -r ".countries.${COUNTRY_CODE}.attributes | to_entries | .[] | select(.value==\"clearance\") | .key" "$MAPPINGS_FILE")
LOCAL_COUNTRY=$(jq -r ".countries.${COUNTRY_CODE}.attributes | to_entries | .[] | select(.value==\"countryOfAffiliation\") | .key" "$MAPPINGS_FILE")
LOCAL_UNIQUEID=$(jq -r ".countries.${COUNTRY_CODE}.attributes | to_entries | .[] | select(.value==\"uniqueID\") | .key" "$MAPPINGS_FILE")
LOCAL_COI=$(jq -r ".countries.${COUNTRY_CODE}.attributes | to_entries | .[] | select(.value==\"acpCOI\") | .key" "$MAPPINGS_FILE")

echo "  Localized attributes:"
echo "    ${LOCAL_CLEARANCE} → clearance"
echo "    ${LOCAL_COUNTRY} → countryOfAffiliation"
echo "    ${LOCAL_UNIQUEID} → uniqueID"
echo "    ${LOCAL_COI} → acpCOI"
echo ""

# Add localized attributes to user profile if not present
NEW_ATTRS='[]'
for attr in "$LOCAL_CLEARANCE" "$LOCAL_COUNTRY" "$LOCAL_UNIQUEID" "$LOCAL_COI"; do
    if [ -n "$attr" ] && [ "$attr" != "null" ]; then
        EXISTS=$(echo "$CURRENT_PROFILE" | jq -r ".attributes[] | select(.name==\"${attr}\") | .name")
        if [ -z "$EXISTS" ]; then
            MULTIVALUED="false"
            if [ "$attr" = "$LOCAL_COI" ]; then
                MULTIVALUED="true"
            fi
            NEW_ATTRS=$(echo "$NEW_ATTRS" | jq ". + [{
                \"name\": \"${attr}\",
                \"displayName\": \"${attr} (${COUNTRY_NAME})\",
                \"permissions\": {\"view\": [\"admin\"], \"edit\": [\"admin\"]},
                \"multivalued\": ${MULTIVALUED}
            }]")
        fi
    fi
done

if [ "$(echo "$NEW_ATTRS" | jq 'length')" -gt 0 ]; then
    UPDATED_PROFILE=$(echo "$CURRENT_PROFILE" | jq ".attributes += ${NEW_ATTRS}")
    curl -sk -X PUT "${KEYCLOAK_URL}/admin/realms/${REALM}/users/profile" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "$UPDATED_PROFILE" > /dev/null
    log_success "Added $(echo "$NEW_ATTRS" | jq 'length') attributes to User Profile"
else
    log_info "All localized attributes already in User Profile"
fi

echo ""
echo -e "${BOLD}Step 2: Removing existing DIVE V3 protocol mappers${NC}"

# Remove existing DIVE V3 mappers
for mapper_name in clearance countryOfAffiliation uniqueID acpCOI; do
    MAPPER_ID=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM}/clients/${CLIENT_UUID}/protocol-mappers/models" \
        -H "Authorization: Bearer $TOKEN" | jq -r ".[] | select(.name==\"${mapper_name}\") | .id")
    if [ -n "$MAPPER_ID" ] && [ "$MAPPER_ID" != "null" ]; then
        curl -sk -X DELETE "${KEYCLOAK_URL}/admin/realms/${REALM}/clients/${CLIENT_UUID}/protocol-mappers/models/${MAPPER_ID}" \
            -H "Authorization: Bearer $TOKEN"
        log_success "Removed mapper: ${mapper_name}"
    fi
done

echo ""
echo -e "${BOLD}Step 3: Creating localized → DIVE V3 protocol mappers${NC}"

# Create mappers
create_mapper() {
    local local_attr="$1"
    local dive_claim="$2"
    local multivalued="${3:-false}"

    local mapper_name="${local_attr} → ${dive_claim}"

    local json_type="String"
    if [ "$multivalued" = "true" ]; then
        json_type="JSON"
    fi

    curl -sk -X POST "${KEYCLOAK_URL}/admin/realms/${REALM}/clients/${CLIENT_UUID}/protocol-mappers/models" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"name\": \"${mapper_name}\",
            \"protocol\": \"openid-connect\",
            \"protocolMapper\": \"oidc-usermodel-attribute-mapper\",
            \"config\": {
                \"user.attribute\": \"${local_attr}\",
                \"claim.name\": \"${dive_claim}\",
                \"id.token.claim\": \"true\",
                \"access.token.claim\": \"true\",
                \"userinfo.token.claim\": \"true\",
                \"multivalued\": \"${multivalued}\",
                \"jsonType.label\": \"${json_type}\"
            }
        }" > /dev/null

    log_success "Created: ${mapper_name}"
}

create_mapper "$LOCAL_CLEARANCE" "clearance" "false"
create_mapper "$LOCAL_COUNTRY" "countryOfAffiliation" "false"
create_mapper "$LOCAL_UNIQUEID" "uniqueID" "false"
create_mapper "$LOCAL_COI" "acpCOI" "true"

echo ""
echo -e "${BOLD}Step 4: Verifying mappers${NC}"

MAPPERS=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM}/clients/${CLIENT_UUID}/protocol-mappers/models" \
    -H "Authorization: Bearer $TOKEN" | jq '[.[] | select(.name | contains("→")) | {name, local: .config["user.attribute"], dive: .config["claim.name"]}]')

echo "$MAPPERS" | jq -r '.[] | "  \(.local) → \(.dive)"'

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Localized mappers configured for ${COUNTRY_NAME}!${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Next steps:"
echo "  1. Update test users with localized attributes"
echo "  2. Test federation via: ./dive spoke test ${COUNTRY_CODE}"
