#!/bin/bash
# =============================================================================
# DIVE V3 - Apply User Profile Template to Spoke Keycloak
# =============================================================================
# Applies locale-specific user profile attributes from templates.
#
# Usage: ./apply-user-profile.sh <COUNTRY_CODE>
# Example: ./apply-user-profile.sh FRA
#
# Templates are located in: keycloak/user-profile-templates/
# Each template defines locale-specific attributes that map to DIVE V3 standard
# claims (clearance, countryOfAffiliation, uniqueID, acpCOI).
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
BOLD='\033[1m'

log_info() { echo -e "${BLUE}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }
log_step() { echo -e "${CYAN}▶${NC} $1"; }

# =============================================================================
# ARGUMENT PARSING
# =============================================================================

if [ -z "$1" ]; then
    echo -e "${BOLD}Usage:${NC} $0 <COUNTRY_CODE>"
    echo ""
    echo "Applies user profile template to spoke Keycloak realm."
    echo ""
    echo "Available templates:"
    ls -1 "${PROJECT_ROOT}/keycloak/user-profile-templates/"*.json 2>/dev/null | xargs -n1 basename | sed 's/.json$//' | xargs -n8 | sed 's/^/  /'
    exit 1
fi

COUNTRY_CODE=$(echo "$1" | tr '[:upper:]' '[:lower:]')
CODE_UPPER=$(echo "$COUNTRY_CODE" | tr '[:lower:]' '[:upper:]')

# Map country codes to template file names
# Template names use full country names (e.g., "france.json", "germany.json")
get_template_name() {
    local code="$1"
    case "$code" in
        alb) echo "albania" ;;
        bel) echo "belgium" ;;
        bgr) echo "bulgaria" ;;
        can) echo "canada" ;;
        hrv) echo "croatia" ;;
        cze) echo "czechia" ;;
        dnk) echo "denmark" ;;
        est) echo "estonia" ;;
        fin) echo "finland" ;;
        fra) echo "france" ;;
        deu) echo "germany" ;;
        grc) echo "greece" ;;
        hun) echo "hungary" ;;
        isl) echo "iceland" ;;
        ita) echo "italy" ;;
        lva) echo "latvia" ;;
        ltu) echo "lithuania" ;;
        lux) echo "luxembourg" ;;
        mne) echo "montenegro" ;;
        nld) echo "netherlands" ;;
        mkd) echo "north-macedonia" ;;
        nor) echo "norway" ;;
        pol) echo "poland" ;;
        prt) echo "portugal" ;;
        rou) echo "romania" ;;
        svk) echo "slovakia" ;;
        svn) echo "slovenia" ;;
        esp) echo "spain" ;;
        swe) echo "sweden" ;;
        tur) echo "turkey" ;;
        gbr) echo "united-kingdom" ;;
        usa) echo "united-states" ;;
        *) echo "" ;;
    esac
}

TEMPLATE_NAME=$(get_template_name "$COUNTRY_CODE")
TEMPLATE_FILE="${PROJECT_ROOT}/keycloak/user-profile-templates/${TEMPLATE_NAME}.json"

if [ -z "$TEMPLATE_NAME" ]; then
    log_error "Unknown country code: $CODE_UPPER"
    exit 1
fi

if [ ! -f "$TEMPLATE_FILE" ]; then
    log_error "Template file not found: $TEMPLATE_FILE"
    exit 1
fi

# =============================================================================
# KEYCLOAK CONNECTION SETUP
# =============================================================================

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║  Applying User Profile Template: ${TEMPLATE_NAME} (${CODE_UPPER})${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Determine Keycloak container and connection details
if [ "$CODE_UPPER" = "USA" ]; then
    KC_CONTAINER="dive-hub-keycloak"
    KEYCLOAK_PORT="8443"
    REALM="dive-v3-broker"
else
    KC_CONTAINER="dive-spoke-${COUNTRY_CODE}-keycloak"
    # Try to find running container
    if ! docker ps --format '{{.Names}}' | grep -q "${KC_CONTAINER}"; then
        # Try alternate naming conventions
        KC_CONTAINER="${COUNTRY_CODE}-keycloak-${COUNTRY_CODE}-1"
    fi
    KEYCLOAK_PORT=$(docker port "$KC_CONTAINER" 8443 2>/dev/null | cut -d: -f2 || echo "8443")
    REALM="dive-v3-broker-${COUNTRY_CODE}"
fi

KEYCLOAK_URL="https://localhost:${KEYCLOAK_PORT}"

# Check if container is running
if ! docker ps --format '{{.Names}}' | grep -q "keycloak"; then
    log_error "No Keycloak container found running for ${CODE_UPPER}"
    log_info "Start the spoke first: ./dive --instance ${CODE_UPPER} spoke up"
    exit 1
fi

log_info "Keycloak URL: ${KEYCLOAK_URL}"
log_info "Realm: ${REALM}"
log_info "Template: ${TEMPLATE_FILE}"
echo ""

# =============================================================================
# GET ADMIN TOKEN
# =============================================================================

log_step "Authenticating with Keycloak Admin API..."

# Get admin password from environment or container
ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-}"
if [ -z "$ADMIN_PASSWORD" ]; then
    ADMIN_PASSWORD=$(docker exec "$KC_CONTAINER" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null || echo "admin")
fi

TOKEN=$(curl -sk -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
    -d "grant_type=password" \
    -d "client_id=admin-cli" \
    -d "username=admin" \
    -d "password=${ADMIN_PASSWORD}" | jq -r '.access_token')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
    log_error "Failed to get admin token"
    exit 1
fi
log_success "Admin authentication successful"

# =============================================================================
# GET CURRENT USER PROFILE
# =============================================================================

log_step "Fetching current User Profile configuration..."

CURRENT_PROFILE=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM}/users/profile" \
    -H "Authorization: Bearer $TOKEN")

if [ -z "$CURRENT_PROFILE" ] || echo "$CURRENT_PROFILE" | grep -q "error"; then
    log_error "Failed to get current user profile"
    echo "$CURRENT_PROFILE"
    exit 1
fi

log_success "Current User Profile retrieved"

# =============================================================================
# APPLY TEMPLATE ATTRIBUTES
# =============================================================================

log_step "Applying attributes from template..."

NATION_NAME=$(jq -r '.nation.name' "$TEMPLATE_FILE")
NATION_ISO=$(jq -r '.nation.iso3166' "$TEMPLATE_FILE")

echo "  Nation: ${NATION_NAME} (${NATION_ISO})"
echo ""

# Get attributes from template
TEMPLATE_ATTRS=$(jq -r '.attributes' "$TEMPLATE_FILE")
ATTR_COUNT=$(echo "$TEMPLATE_ATTRS" | jq 'length')

echo "  Template defines ${ATTR_COUNT} attributes:"

# Build the new attributes array for User Profile
NEW_ATTRS='[]'
ADDED=0
SKIPPED=0

for i in $(seq 0 $((ATTR_COUNT - 1))); do
    ATTR=$(echo "$TEMPLATE_ATTRS" | jq ".[$i]")
    ATTR_NAME=$(echo "$ATTR" | jq -r '.name')
    ATTR_DISPLAY=$(echo "$ATTR" | jq -r '.displayName')
    ATTR_REQUIRED=$(echo "$ATTR" | jq -r '.required // false')
    ATTR_MULTIVALUED=$(echo "$ATTR" | jq -r '.multivalued // false')

    # Check if attribute already exists in current profile
    EXISTS=$(echo "$CURRENT_PROFILE" | jq -r ".attributes[] | select(.name==\"${ATTR_NAME}\") | .name")

    if [ -n "$EXISTS" ]; then
        echo "    ○ ${ATTR_NAME} (already exists)"
        ((SKIPPED++))
        continue
    fi

    # Build attribute definition for Keycloak User Profile
    NEW_ATTR=$(jq -n \
        --arg name "$ATTR_NAME" \
        --arg display "$ATTR_DISPLAY" \
        --argjson required "$ATTR_REQUIRED" \
        --argjson multivalued "$ATTR_MULTIVALUED" \
        '{
            name: $name,
            displayName: $display,
            required: { roles: (if $required then ["user"] else [] end) },
            permissions: { view: ["admin", "user"], edit: ["admin"] },
            multivalued: $multivalued
        }')

    NEW_ATTRS=$(echo "$NEW_ATTRS" | jq ". + [$NEW_ATTR]")
    echo "    + ${ATTR_NAME}"
    ((ADDED++))
done

echo ""

if [ $ADDED -eq 0 ]; then
    log_info "All template attributes already exist in User Profile"
else
    log_step "Adding ${ADDED} new attributes to User Profile..."

    # Merge new attributes with existing profile
    UPDATED_PROFILE=$(echo "$CURRENT_PROFILE" | jq ".attributes += ${NEW_ATTRS}")

    # Update User Profile in Keycloak
    RESPONSE=$(curl -sk -X PUT "${KEYCLOAK_URL}/admin/realms/${REALM}/users/profile" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "$UPDATED_PROFILE" 2>&1)

    if echo "$RESPONSE" | grep -q "error"; then
        log_error "Failed to update User Profile"
        echo "$RESPONSE"
        exit 1
    fi

    log_success "User Profile updated with ${ADDED} new attributes"
fi

# =============================================================================
# MAKE EMAIL/FIRSTNAME/LASTNAME NOT REQUIRED (PII MINIMIZATION)
# =============================================================================

log_step "Configuring PII minimization (making email/firstName/lastName not required)..."

# Get the latest profile
PROFILE_TO_UPDATE=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM}/users/profile" \
    -H "Authorization: Bearer $TOKEN")

# Remove required constraint from email, firstName, lastName
PROFILE_TO_UPDATE=$(echo "$PROFILE_TO_UPDATE" | jq '
  .attributes = [.attributes[] | 
    if .name == "email" or .name == "firstName" or .name == "lastName" then
      del(.required)
    else
      .
    end
  ]
')

# Update User Profile
curl -sk -X PUT "${KEYCLOAK_URL}/admin/realms/${REALM}/users/profile" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$PROFILE_TO_UPDATE" > /dev/null 2>&1

log_success "PII fields (email/firstName/lastName) are now optional"

# =============================================================================
# SUMMARY
# =============================================================================

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  User Profile Template Applied Successfully!${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  Nation: ${NATION_NAME} (${NATION_ISO})${NC}"
echo -e "${GREEN}║  Added: ${ADDED} attributes | Skipped: ${SKIPPED} (already exist)${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Remind about localized mappers if this is a non-USA spoke
if [ "$CODE_UPPER" != "USA" ]; then
    echo "Next steps:"
    echo "  1. Apply localized attribute mappers:"
    echo "     ./scripts/spoke-init/configure-localized-mappers.sh ${CODE_UPPER}"
    echo "  2. Seed test users with locale-specific attributes:"
    echo "     ./scripts/spoke-init/seed-localized-users.sh ${CODE_UPPER}"
    echo ""
fi
