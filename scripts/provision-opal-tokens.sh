#!/usr/local/bin/bash
# =============================================================================
# OPAL Token Provisioning Script
# =============================================================================
# Best Practice: Obtain JWT tokens from the OPAL server's /token endpoint
# using the master token for authentication.
#
# Usage:
#   ./scripts/provision-opal-tokens.sh                    # Provision all spokes
#   ./scripts/provision-opal-tokens.sh lux                # Provision specific spoke
#   ./scripts/provision-opal-tokens.sh --verify           # Verify tokens only
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIVE_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

# Configuration
OPAL_SERVER_URL="${OPAL_SERVER_URL:-https://localhost:7002}"
HUB_ENV_FILE="${DIVE_ROOT}/.env.hub"

log_info() { echo -e "${CYAN}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }

# Get master token from Hub's .env
get_master_token() {
    if [ -f "$HUB_ENV_FILE" ]; then
        grep "^OPAL_AUTH_MASTER_TOKEN=" "$HUB_ENV_FILE" | cut -d= -f2
    else
        log_error "Hub .env file not found at $HUB_ENV_FILE"
        return 1
    fi
}

# Request JWT from OPAL server
request_opal_jwt() {
    local master_token="$1"

    local response=$(curl -sk --max-time 10 \
        -X POST "${OPAL_SERVER_URL}/token" \
        -H "Authorization: Bearer ${master_token}" \
        -H "Content-Type: application/json" \
        -d '{"type": "client"}' 2>/dev/null)

    if [ -z "$response" ]; then
        log_error "No response from OPAL server at ${OPAL_SERVER_URL}"
        return 1
    fi

    local token=$(echo "$response" | jq -r '.token // empty' 2>/dev/null)
    local expires=$(echo "$response" | jq -r '.details.expired // empty' 2>/dev/null)

    if [ -z "$token" ]; then
        log_error "Failed to get token: $(echo "$response" | jq -r '.error // .detail // "Unknown error"')"
        return 1
    fi

    echo "$token"
}

# Provision token for a spoke
provision_spoke() {
    local spoke_code="$1"
    local spoke_dir="${DIVE_ROOT}/instances/${spoke_code}"
    local env_file="${spoke_dir}/.env"

    if [ ! -d "$spoke_dir" ]; then
        log_warn "Spoke directory not found: $spoke_dir"
        return 1
    fi

    log_info "Provisioning OPAL token for ${spoke_code^^}..."

    # Get master token
    local master_token=$(get_master_token)
    if [ -z "$master_token" ]; then
        log_error "Could not get master token"
        return 1
    fi

    # Request JWT from OPAL server
    local jwt=$(request_opal_jwt "$master_token")
    if [ -z "$jwt" ]; then
        return 1
    fi

    # Update spoke's .env file
    if [ -f "$env_file" ]; then
        # Remove existing OPAL token entries
        sed -i.bak '/^SPOKE_OPAL_TOKEN=/d' "$env_file"
        sed -i.bak '/^OPAL_CLIENT_JWT=/d' "$env_file"
        rm -f "$env_file.bak"
    else
        touch "$env_file"
    fi

    # Add the JWT token
    echo "" >> "$env_file"
    echo "# OPAL Client JWT - obtained from OPAL server $(date -u +"%Y-%m-%dT%H:%M:%SZ")" >> "$env_file"
    echo "SPOKE_OPAL_TOKEN=${jwt}" >> "$env_file"

    log_success "Token provisioned for ${spoke_code^^}"
    echo "  Token: ${jwt:0:50}..."

    # Restart OPAL client if running
    local container="dive-spoke-${spoke_code}-opal-client"
    if docker ps -q --filter "name=${container}" 2>/dev/null | grep -q .; then
        log_info "Restarting OPAL client container..."
        docker restart "$container" >/dev/null 2>&1
        log_success "OPAL client restarted"
    fi
}

# Verify OPAL connection
verify_spoke() {
    local spoke_code="$1"
    local container="dive-spoke-${spoke_code}-opal-client"

    if ! docker ps -q --filter "name=${container}" 2>/dev/null | grep -q .; then
        log_warn "${spoke_code^^}: OPAL client not running"
        return 1
    fi

    # Check logs for connection status
    local logs=$(docker logs "$container" 2>&1 | tail -20)

    if echo "$logs" | grep -q "Connected to PubSub server"; then
        log_success "${spoke_code^^}: OPAL client connected ✓"
        return 0
    elif echo "$logs" | grep -q "403\|Forbidden"; then
        log_error "${spoke_code^^}: OPAL client authentication failed (403)"
        return 1
    else
        log_warn "${spoke_code^^}: Connection status unknown"
        return 1
    fi
}

# Main
main() {
    local action="provision"
    local spoke_codes=()

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --verify|-v)
                action="verify"
                shift
                ;;
            --help|-h)
                echo "Usage: $0 [options] [spoke_codes...]"
                echo ""
                echo "Options:"
                echo "  --verify, -v    Verify OPAL connections only"
                echo "  --help, -h      Show this help"
                echo ""
                echo "Examples:"
                echo "  $0              Provision all spokes"
                echo "  $0 lux mne      Provision specific spokes"
                echo "  $0 --verify     Verify all spoke connections"
                exit 0
                ;;
            *)
                spoke_codes+=("$1")
                shift
                ;;
        esac
    done

    # If no spokes specified, find all
    if [ ${#spoke_codes[@]} -eq 0 ]; then
        for dir in "${DIVE_ROOT}/instances/"*/; do
            if [ -d "$dir" ]; then
                code=$(basename "$dir")
                # Skip hub-related directories
                if [[ "$code" != "hub" && "$code" != "templates" ]]; then
                    spoke_codes+=("$code")
                fi
            fi
        done
    fi

    echo ""
    echo -e "${BOLD}OPAL Token Provisioning${NC}"
    echo "========================"
    echo ""

    case "$action" in
        provision)
            log_info "Master token source: $HUB_ENV_FILE"
            log_info "OPAL server: $OPAL_SERVER_URL"
            echo ""

            for code in "${spoke_codes[@]}"; do
                provision_spoke "$code"
                echo ""
            done

            log_success "Token provisioning complete!"
            echo ""
            echo "Next steps:"
            echo "  1. Restart spoke OPAL clients: docker restart dive-spoke-<code>-opal-client"
            echo "  2. Verify connections: $0 --verify"
            ;;
        verify)
            for code in "${spoke_codes[@]}"; do
                verify_spoke "$code"
            done
            ;;
    esac
}

main "$@"

