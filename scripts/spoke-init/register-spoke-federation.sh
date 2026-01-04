#!/bin/bash
# =============================================================================
# register-spoke-federation.sh
# =============================================================================
# Registers a spoke in the federation registry and configures cross-instance auth
#
# This script ensures:
# 1. Spoke is added to config/federation-registry.json
# 2. Spoke's TRUSTED_ISSUERS includes Hub Keycloak
# 3. Hub can query spoke's resources via federated search
#
# Usage:
#   ./register-spoke-federation.sh <INSTANCE_CODE>
#
# Example:
#   ./register-spoke-federation.sh HUN
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIVE_ROOT="${SCRIPT_DIR}/../.."

# =============================================================================
# FUNCTIONS
# =============================================================================

log_info() { echo -e "${CYAN}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

show_usage() {
    echo "Usage: $0 <INSTANCE_CODE>"
    echo ""
    echo "Arguments:"
    echo "  INSTANCE_CODE   3-letter ISO country code (e.g., HUN, POL, CZE)"
    echo ""
    echo "Examples:"
    echo "  $0 HUN          Register Hungary in federation"
    echo "  $0 POL          Register Poland in federation"
    exit 1
}

# Get country name from ISO code
get_country_name() {
    local code="$1"
    case "$code" in
        USA) echo "United States" ;;
        FRA) echo "France" ;;
        GBR) echo "United Kingdom" ;;
        DEU) echo "Germany" ;;
        CAN) echo "Canada" ;;
        AUS) echo "Australia" ;;
        NZL) echo "New Zealand" ;;
        ITA) echo "Italy" ;;
        ESP) echo "Spain" ;;
        NLD) echo "Netherlands" ;;
        POL) echo "Poland" ;;
        BEL) echo "Belgium" ;;
        PRT) echo "Portugal" ;;
        GRC) echo "Greece" ;;
        TUR) echo "Turkey" ;;
        NOR) echo "Norway" ;;
        DNK) echo "Denmark" ;;
        CZE) echo "Czechia" ;;
        HUN) echo "Hungary" ;;
        SVK) echo "Slovakia" ;;
        SVN) echo "Slovenia" ;;
        HRV) echo "Croatia" ;;
        ROU) echo "Romania" ;;
        BGR) echo "Bulgaria" ;;
        EST) echo "Estonia" ;;
        LVA) echo "Latvia" ;;
        LTU) echo "Lithuania" ;;
        ALB) echo "Albania" ;;
        MNE) echo "Montenegro" ;;
        MKD) echo "North Macedonia" ;;
        LUX) echo "Luxembourg" ;;
        ISL) echo "Iceland" ;;
        FIN) echo "Finland" ;;
        SWE) echo "Sweden" ;;
        *) echo "$code" ;;
    esac
}

# Get locale from ISO code
get_locale() {
    local code="$1"
    case "$code" in
        USA) echo "en-US" ;;
        FRA) echo "fr-FR" ;;
        GBR) echo "en-GB" ;;
        DEU) echo "de-DE" ;;
        CAN) echo "en-CA" ;;
        AUS) echo "en-AU" ;;
        NZL) echo "en-NZ" ;;
        ITA) echo "it-IT" ;;
        ESP) echo "es-ES" ;;
        NLD) echo "nl-NL" ;;
        POL) echo "pl-PL" ;;
        BEL) echo "nl-BE" ;;
        PRT) echo "pt-PT" ;;
        GRC) echo "el-GR" ;;
        TUR) echo "tr-TR" ;;
        NOR) echo "no-NO" ;;
        DNK) echo "da-DK" ;;
        CZE) echo "cs-CZ" ;;
        HUN) echo "hu-HU" ;;
        SVK) echo "sk-SK" ;;
        SVN) echo "sl-SI" ;;
        HRV) echo "hr-HR" ;;
        ROU) echo "ro-RO" ;;
        BGR) echo "bg-BG" ;;
        EST) echo "et-EE" ;;
        LVA) echo "lv-LV" ;;
        LTU) echo "lt-LT" ;;
        ALB) echo "sq-AL" ;;
        MNE) echo "sr-ME" ;;
        MKD) echo "mk-MK" ;;
        LUX) echo "lb-LU" ;;
        ISL) echo "is-IS" ;;
        FIN) echo "fi-FI" ;;
        SWE) echo "sv-SE" ;;
        *) echo "en-US" ;;
    esac
}

# =============================================================================
# MAIN
# =============================================================================

# Check arguments
if [ -z "$1" ]; then
    show_usage
fi

INSTANCE_CODE="${1^^}"  # Uppercase
INSTANCE_LOWER="${INSTANCE_CODE,,}"  # Lowercase

log_info "Registering spoke ${INSTANCE_CODE} in federation..."

# Check if spoke instance directory exists
INSTANCE_DIR="${DIVE_ROOT}/instances/${INSTANCE_LOWER}"
if [ ! -d "$INSTANCE_DIR" ]; then
    log_error "Instance directory not found: ${INSTANCE_DIR}"
    log_error "Deploy the spoke first with: ./dive spoke deploy ${INSTANCE_CODE}"
    exit 1
fi

# Check docker-compose for the spoke
COMPOSE_FILE="${INSTANCE_DIR}/docker-compose.yml"
if [ ! -f "$COMPOSE_FILE" ]; then
    log_error "Docker compose not found: ${COMPOSE_FILE}"
    exit 1
fi

# Get port information from docker-compose
log_info "Reading port configuration from ${COMPOSE_FILE}..."

# Extract ports from docker-compose (macOS compatible)
# Format: - "EXTERNAL:INTERNAL"
extract_port() {
    local service="$1"
    local internal_port="$2"
    local default="$3"
    grep -A30 "${service}:" "$COMPOSE_FILE" | grep -A5 "ports:" | grep ":${internal_port}" | head -1 | sed 's/.*"\([0-9]*\):.*/\1/' | tr -d ' -"' || echo "$default"
}

FRONTEND_PORT=$(extract_port "frontend-${INSTANCE_LOWER}" "3000" "3457")
BACKEND_PORT=$(extract_port "backend-${INSTANCE_LOWER}" "4000" "4457")
KEYCLOAK_PORT=$(extract_port "keycloak-${INSTANCE_LOWER}" "8443" "8456")
MONGODB_PORT=$(extract_port "mongodb-${INSTANCE_LOWER}" "27017" "27020")

# Validate we got actual numbers
[[ "$FRONTEND_PORT" =~ ^[0-9]+$ ]] || FRONTEND_PORT="3457"
[[ "$BACKEND_PORT" =~ ^[0-9]+$ ]] || BACKEND_PORT="4457"
[[ "$KEYCLOAK_PORT" =~ ^[0-9]+$ ]] || KEYCLOAK_PORT="8456"
[[ "$MONGODB_PORT" =~ ^[0-9]+$ ]] || MONGODB_PORT="27020"

# Container names (new naming pattern: dive-spoke-lva-backend)
FRONTEND_CONTAINER="dive-spoke-${INSTANCE_LOWER}-frontend"
BACKEND_CONTAINER="dive-spoke-${INSTANCE_LOWER}-backend"
KEYCLOAK_CONTAINER="dive-spoke-${INSTANCE_LOWER}-keycloak"
MONGODB_CONTAINER="dive-spoke-${INSTANCE_LOWER}-mongodb"

log_info "Detected ports: Frontend=${FRONTEND_PORT}, Backend=${BACKEND_PORT}, Keycloak=${KEYCLOAK_PORT}"

# =============================================================================
# STEP 1: Update federation-registry.json
# =============================================================================

REGISTRY_FILE="${DIVE_ROOT}/config/federation-registry.json"

if [ ! -f "$REGISTRY_FILE" ]; then
    log_error "Federation registry not found: ${REGISTRY_FILE}"
    exit 1
fi

# Check if already registered
if jq -e ".instances.${INSTANCE_LOWER}" "$REGISTRY_FILE" > /dev/null 2>&1; then
    log_warn "${INSTANCE_CODE} already in federation registry, updating..."
fi

COUNTRY_NAME=$(get_country_name "$INSTANCE_CODE")
LOCALE=$(get_locale "$INSTANCE_CODE")

log_info "Adding ${INSTANCE_CODE} (${COUNTRY_NAME}) to federation registry..."

# Create the instance entry and update registry
jq --arg code "$INSTANCE_CODE" \
   --arg name "$COUNTRY_NAME" \
   --arg locale "$LOCALE" \
   --arg lower "$INSTANCE_LOWER" \
   --arg fe_port "$FRONTEND_PORT" \
   --arg be_port "$BACKEND_PORT" \
   --arg kc_port "$KEYCLOAK_PORT" \
   --arg mongo_port "$MONGODB_PORT" \
   --arg fe_container "$FRONTEND_CONTAINER" \
   --arg be_container "$BACKEND_CONTAINER" \
   --arg kc_container "$KEYCLOAK_CONTAINER" \
   --arg mongo_container "$MONGODB_CONTAINER" \
   '
   .instances[$lower] = {
       "code": $code,
       "name": $name,
       "locale": $locale,
       "type": "local",
       "primary": false,
       "enabled": true,
       "deployment": {
           "provider": "docker",
           "host": "localhost",
           "domain": "dive25.com",
           "composeFile": ("docker-compose." + $lower + ".yml"),
           "projectName": $lower
       },
       "services": {
           "_comment": ($code + " uses " + $lower + "- prefix on all service names"),
           "frontend": {
               "name": ("frontend-" + $lower),
               "containerName": $fe_container,
               "internalPort": 3000,
               "externalPort": ($fe_port | tonumber),
               "protocol": "https",
               "hostname": ($lower + "-app.dive25.com")
           },
           "backend": {
               "name": ("backend-" + $lower),
               "containerName": $be_container,
               "internalPort": 4000,
               "externalPort": ($be_port | tonumber),
               "protocol": "https",
               "hostname": ($lower + "-api.dive25.com")
           },
           "keycloak": {
               "name": ("keycloak-" + $lower),
               "containerName": $kc_container,
               "internalPort": 8443,
               "externalPort": ($kc_port | tonumber),
               "protocol": "https",
               "hostname": ($lower + "-idp.dive25.com")
           },
           "mongodb": {
               "name": ("mongodb-" + $lower),
               "containerName": $mongo_container,
               "internalPort": 27017,
               "externalPort": ($mongo_port | tonumber),
               "protocol": "mongodb"
           }
       }
   } |
   # Add to federation matrix
   .federation.matrix.usa += [$lower] |
   .federation.matrix.usa |= unique |
   .federation.matrix[$lower] = ["usa", "fra", "gbr", "deu"] |
   .federation.matrix[$lower] |= unique
   ' "$REGISTRY_FILE" > "${REGISTRY_FILE}.tmp"

mv "${REGISTRY_FILE}.tmp" "$REGISTRY_FILE"
log_success "Updated federation-registry.json"

# =============================================================================
# STEP 2: Ensure spoke has Hub in TRUSTED_ISSUERS
# =============================================================================

log_info "Checking spoke's TRUSTED_ISSUERS configuration..."

# Hub issuer URLs that must be trusted (FIX: Jan 2026 - Updated to dive-v3-broker-usa)
HUB_ISSUERS="https://localhost:8443/realms/dive-v3-broker-usa,https://keycloak:8443/realms/dive-v3-broker-usa,https://usa-idp.dive25.com/realms/dive-v3-broker-usa"

# Check current TRUSTED_ISSUERS in docker-compose
CURRENT_ISSUERS=$(grep "TRUSTED_ISSUERS:" "$COMPOSE_FILE" | head -1 | sed 's/.*TRUSTED_ISSUERS: //' || echo "")

if [[ "$CURRENT_ISSUERS" != *"https://localhost:8443/realms/dive-v3-broker-usa"* ]]; then
    log_info "Adding Hub issuers to spoke's TRUSTED_ISSUERS..."

    # Update the docker-compose file to include Hub issuers
    sed -i.bak "s|TRUSTED_ISSUERS: \(.*\)|TRUSTED_ISSUERS: \1,${HUB_ISSUERS}|" "$COMPOSE_FILE"
    rm -f "${COMPOSE_FILE}.bak"

    log_success "Updated TRUSTED_ISSUERS in docker-compose.yml"

    # Restart the spoke backend to pick up changes
    log_info "Restarting spoke backend to apply changes..."
    cd "$INSTANCE_DIR"
    docker-compose up -d "backend-${INSTANCE_LOWER}" 2>/dev/null || true
    cd "$DIVE_ROOT"
else
    log_info "Hub issuers already configured in spoke"
fi

# =============================================================================
# STEP 3: Restart Hub backend to pick up new registry
# =============================================================================

log_info "Restarting Hub backend to load updated registry..."

# Check if Hub is running
if docker ps --format '{{.Names}}' | grep -q "dive-hub-backend"; then
    docker restart dive-hub-backend > /dev/null 2>&1
    log_success "Hub backend restarted"
else
    log_warn "Hub backend not running, start it with: ./dive up"
fi

# =============================================================================
# SUMMARY
# =============================================================================

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Federation Registration Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Instance: ${CYAN}${INSTANCE_CODE}${NC} (${COUNTRY_NAME})"
echo -e "Registry: ${CYAN}config/federation-registry.json${NC}"
echo ""
echo -e "${YELLOW}What was configured:${NC}"
echo "  ✓ Added ${INSTANCE_CODE} to federation registry"
echo "  ✓ Configured federation matrix (USA ↔ ${INSTANCE_CODE})"
echo "  ✓ Added Hub issuers to spoke's TRUSTED_ISSUERS"
echo "  ✓ Restarted services to apply changes"
echo ""
echo -e "${YELLOW}Federated search is now enabled:${NC}"
echo "  • Users logging in via Hub can search ${INSTANCE_CODE} resources"
echo "  • ${INSTANCE_CODE} users can access Hub resources"
echo ""
echo -e "Test with: ${CYAN}./dive federation status${NC}"
echo ""
