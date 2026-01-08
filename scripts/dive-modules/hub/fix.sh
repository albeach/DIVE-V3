#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Hub Fix Sub-Module
# =============================================================================
# Hub configuration fix and maintenance functions
# Direct-loaded by hub.sh for immediate availability
# =============================================================================

# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Mark this sub-module as loaded
export DIVE_HUB_FIX_LOADED=1

# =============================================================================
# CONSTANTS (inherit from hub.sh if not set)
# =============================================================================

HUB_DATA_DIR="${DIVE_ROOT}/data/hub"
HUB_KEYCLOAK_URL="${HUB_KEYCLOAK_URL:-https://localhost:${KEYCLOAK_HTTPS_PORT:-8443}}"

# =============================================================================
# HUB FIX COMMAND
# =============================================================================

hub_fix() {
    print_header
    echo -e "${BOLD}DIVE Hub - Configuration Fix${NC}"
    echo ""

    local fix_type="${1:-all}"

    case "$fix_type" in
        client-id|clientid)
            log_step "Fixing client ID configuration..."
            _load_hub_init && _hub_validate_client_ids
            if [ $? -eq 0 ]; then
                log_success "Client ID configuration is correct"
            else
                log_warn "Issues found - restart required"
                echo ""
                log_info "Run: ./dive hub down && ./dive hub up"
            fi
            ;;

        all|*)
            log_step "Running all configuration fixes..."

            # Fix 1: Client ID
            log_info "→ Checking client IDs..."
            _load_hub_init && _hub_validate_client_ids

            # Future fixes can be added here

            echo ""
            log_success "Configuration fix complete"
            echo ""
            log_info "If issues were found, restart hub:"
            echo "  ./dive hub down && ./dive hub up"
            ;;
    esac
}