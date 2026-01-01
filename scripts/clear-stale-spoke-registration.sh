#!/usr/bin/env bash
# =============================================================================
# Clear Stale Spoke Registration
# =============================================================================
# Removes stale registeredSpokeId from spoke config.json files after a hub
# database reset/nuke. This allows spokes to re-register with the hub.
#
# Usage:
#   ./scripts/clear-stale-spoke-registration.sh [instance_code]
#   ./scripts/clear-stale-spoke-registration.sh fra    # Clear FRA only
#   ./scripts/clear-stale-spoke-registration.sh --all  # Clear all spokes
# =============================================================================

set -e

DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTANCES_DIR="${DIVE_ROOT}/instances"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${CYAN}ℹ ${NC}$*"; }
log_success() { echo -e "${GREEN}✅ ${NC}$*"; }
log_warn() { echo -e "${YELLOW}⚠️  ${NC}$*"; }
log_error() { echo -e "${RED}❌ ${NC}$*"; }

clear_spoke_registration() {
    local instance_code="$1"
    local code_lower=$(echo "$instance_code" | tr '[:upper:]' '[:lower:]')
    local config_file="${INSTANCES_DIR}/${code_lower}/config.json"

    if [ ! -f "$config_file" ]; then
        log_warn "No config found for ${instance_code} (skipping)"
        return 0
    fi

    # Check if registeredSpokeId exists
    if ! grep -q '"registeredSpokeId"' "$config_file"; then
        log_info "${instance_code}: No stale registration (skipping)"
        return 0
    fi

    local old_id=$(grep -o '"registeredSpokeId"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4)

    # Remove registeredSpokeId using jq (preferred) or sed (fallback)
    if command -v jq &> /dev/null; then
        jq 'del(.identity.registeredSpokeId)' "$config_file" > "${config_file}.tmp" && \
            mv "${config_file}.tmp" "$config_file"
    else
        # Fallback: sed (less reliable for JSON)
        sed -i.bak '/"registeredSpokeId"/d' "$config_file"
        rm -f "${config_file}.bak"
    fi

    # Also reset federation status to unregistered
    if command -v jq &> /dev/null; then
        jq '.federation.status = "unregistered" | del(.federation.registeredAt)' "$config_file" > "${config_file}.tmp" && \
            mv "${config_file}.tmp" "$config_file"
    fi

    # Remove federation-registered marker file
    rm -f "${INSTANCES_DIR}/${code_lower}/.federation-registered"

    log_success "${instance_code}: Cleared stale registration (was: ${old_id})"
}

# =============================================================================
# MAIN
# =============================================================================

if [ $# -eq 0 ]; then
    echo "Usage: $0 <instance_code|--all>"
    echo ""
    echo "Examples:"
    echo "  $0 fra          # Clear FRA spoke registration"
    echo "  $0 --all        # Clear all spoke registrations"
    exit 1
fi

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}         Clearing Stale Spoke Registrations                ${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo ""

if [ "$1" = "--all" ] || [ "$1" = "-a" ]; then
    log_info "Clearing all spoke registrations..."
    echo ""

    count=0
    for spoke_dir in "${INSTANCES_DIR}"/*; do
        if [ -d "$spoke_dir" ] && [ -f "$spoke_dir/config.json" ]; then
            instance_code=$(basename "$spoke_dir" | tr '[:lower:]' '[:upper:]')
            clear_spoke_registration "$instance_code"
            count=$((count + 1))
        fi
    done

    echo ""
    log_success "Processed ${count} spoke(s)"
else
    instance_code=$(echo "$1" | tr '[:lower:]' '[:upper:]')
    clear_spoke_registration "$instance_code"
fi

echo ""
log_info "Next steps:"
echo "  1. Start spokes: ./dive --instance fra up"
echo "  2. Auto-registration will trigger with fresh spoke IDs"
echo ""
