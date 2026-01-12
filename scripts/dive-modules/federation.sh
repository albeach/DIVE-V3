#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 CLI - Federation & Hub Commands Module (Refactored)
# =============================================================================
# Commands: federation (status, register, sync-policies, sync-idps, push-audit,
#                       link, unlink, verify, fix, list-idps, test, mappers)
# =============================================================================
# Version: 2.0.0
# Date: 2025-12-23
# Refactored: Extracted sub-modules for lazy loading
#   - federation-link.sh    (~700 lines) - link, unlink, verify, fix, list-idps
#   - federation-mappers.sh (~340 lines) - mapper management
#   - federation-test.sh    (~280 lines) - integration tests
# =============================================================================

# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Load federation setup functions for admin token management
if [ -z "$DIVE_FEDERATION_SETUP_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/federation-setup.sh"
    export DIVE_FEDERATION_SETUP_LOADED=1
fi

# Load all federation sub-modules (consolidation preparation)
if [ -z "$DIVE_FEDERATION_LINK_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/federation-link.sh"
    export DIVE_FEDERATION_LINK_LOADED=1
fi

if [ -z "$DIVE_FEDERATION_MAPPERS_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/federation-mappers.sh"
    export DIVE_FEDERATION_MAPPERS_LOADED=1
fi

if [ -z "$DIVE_FEDERATION_TEST_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/federation-test.sh"
    export DIVE_FEDERATION_TEST_LOADED=1
fi

if [ -z "$DIVE_FEDERATION_DIAGNOSE_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/federation-diagnose.sh"
    export DIVE_FEDERATION_DIAGNOSE_LOADED=1
fi

if [ -z "$DIVE_FEDERATION_STATE_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/federation-state.sh"
    export DIVE_FEDERATION_STATE_LOADED=1
fi

# All federation sub-modules loaded at initialization

# =============================================================================
# ADMIN TOKEN HELPERS
# =============================================================================

##
# Get admin token for any instance (hub or spoke)
#
# Arguments:
#   $1 - Instance code (e.g., usa, alb, bel)
#
# Outputs:
#   Admin access token on stdout
#
# Returns:
#   0 - Success
#   1 - Failed
##
get_instance_admin_token() {
    local instance_code="${1:?Instance code required}"
    local code_upper
    code_upper=$(upper "$instance_code")

    if [ "$code_upper" = "USA" ]; then
        # Use super_admin token for Hub (required for backend API auth)
        get_hub_super_admin_token
    else
        get_spoke_admin_token "$code_upper"
    fi
}

# =============================================================================
# FEDERATION CORE COMMANDS
# =============================================================================

federation_status() {
    echo -e "${BOLD}Federation Status:${NC}"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would query hub API for registered instances"
        return 0
    fi

    # Determine hub URL based on environment
    local hub_url="https://localhost:4000"
    if [ "$ENVIRONMENT" = "gcp" ] || [ "$ENVIRONMENT" = "pilot" ]; then
        hub_url="https://usa-api.dive25.com"
    fi

    echo "  ${CYAN}Environment: ${ENVIRONMENT:-LOCAL}${NC}"
    echo "  ${CYAN}Hub URL: ${hub_url}${NC}"
    echo ""

    # Query hub for federation status
    local response
    response=$(curl -sk --max-time 10 "${hub_url}/api/federation/status" 2>/dev/null)

    if [ $? -eq 0 ] && [ -n "$response" ]; then
        # Parse successful response
        echo "  ${CYAN}Federation Hub:${NC}"

        # Extract hub info
        local hub_name hub_status
        hub_name=$(echo "$response" | jq -r '.hub.name // "USA"' 2>/dev/null)
        hub_status=$(echo "$response" | jq -r '.hub.status // "unknown"' 2>/dev/null)

        case "$hub_status" in
            "healthy") echo "    $hub_name (Hub): ${GREEN}✓ Operational${NC}" ;;
            "degraded") echo "    $hub_name (Hub): ${YELLOW}⚠ Degraded${NC}" ;;
            "down") echo "    $hub_name (Hub): ${RED}✗ Down${NC}" ;;
            *) echo "    $hub_name (Hub): ${YELLOW}? Status unknown${NC}" ;;
        esac

        echo ""
        echo "  ${CYAN}Registered Spokes:${NC}"

        # Extract instances array
        local approved_spokes
        approved_spokes=$(echo "$response" | jq -r '.instances[] | select(.status == "approved") | "\(.name) (\(.code))"' 2>/dev/null)

        if [ -n "$approved_spokes" ]; then
            echo "$approved_spokes" | while read -r spoke; do
                echo "    ${GREEN}✓${NC} $spoke"
            done
        else
            echo "    ${YELLOW}No approved spokes registered${NC}"
        fi

        # Show pending if any
        local pending_spokes
        pending_spokes=$(echo "$response" | jq -r '.instances[] | select(.status == "pending") | "\(.name) (\(.code))"' 2>/dev/null)
        if [ -n "$pending_spokes" ]; then
            echo ""
            echo "  ${CYAN}Pending Approval:${NC}"
            echo "$pending_spokes" | while read -r spoke; do
                echo "    ${YELLOW}⏳${NC} $spoke"
            done
        fi
    else
        echo "  ${RED}Failed to connect to hub${NC}"
        echo ""
        echo "  Check that the hub is running:"
        echo "    ./dive hub status"
    fi

    echo ""
}

federation_register() {
    local instance_url="${1:-}"
    if [ -z "$instance_url" ]; then
        echo "Usage: ./dive federation register <instance-url>"
        return 1
    fi
    log_step "Registering instance: $instance_url"
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would POST to hub API: /api/federation/register"
        log_dry "  instance_url: $instance_url"
        log_dry "  instance_code: $INSTANCE"
    else
        echo "Registration would connect to hub API..."
        echo "TODO: Implement hub registration endpoint"
    fi
}

# NOTE: The following commands have been removed (superseded by spoke commands):
# - federation_sync_policies -> Use: ./dive spoke policy <CODE> sync
# - federation_sync_idps -> Not needed (IdPs configured via federation-setup)
# - federation_push_audit -> Use: spoke audit queue (automatic sync)

# =============================================================================
# FEDERATION REGISTRY - Add spoke to federation-registry.json
# =============================================================================

federation_register_spoke() {
    local instance_code="${1:-}"

    if [ -z "$instance_code" ]; then
        log_error "Instance code required"
        echo ""
        echo "Usage: ./dive federation register-spoke <CODE>"
        echo ""
        echo "Examples:"
        echo "  ./dive federation register-spoke HUN"
        echo "  ./dive federation register-spoke POL"
        return 1
    fi

    local code_upper="${instance_code^^}"
    local register_script="${DIVE_ROOT}/scripts/spoke-init/register-spoke-federation.sh"

    if [ ! -f "$register_script" ]; then
        log_error "Federation registration script not found: $register_script"
        return 1
    fi

    log_info "Registering ${code_upper} in federation registry..."
    bash "$register_script" "$code_upper"
}

# =============================================================================
# STUB FUNCTIONS FOR LAZY-LOADED MODULES
# =============================================================================

# federation-link.sh stubs
_federation_link_stub() {
    _load_federation_link && federation_link "$@"
}

_federation_unlink_stub() {
    _load_federation_link && federation_unlink "$@"
}

_federation_verify_stub() {
    _load_federation_link && federation_verify "$@"
}

_federation_fix_stub() {
    _load_federation_link && federation_fix "$@"
}

_federation_list_idps_stub() {
    _load_federation_link && federation_list_idps "$@"
}

# federation-mappers.sh stubs
_federation_mappers_dispatch_stub() {
    _load_federation_mappers && federation_mappers_dispatch "$@"
}

# federation-test.sh stubs
_federation_test_stub() {
    _load_federation_test && federation_test_module "$@"
}

_federation_health_check_stub() {
    _load_federation_test && federation_health_check "$@"
}

_federation_sync_secrets_stub() {
    _load_federation_link && federation_sync_secrets "$@"
}

_federation_verify_all_stub() {
    _load_federation_link && federation_verify_all "$@"
}

# =============================================================================
# MODULE DISPATCH
# =============================================================================

module_federation() {
    local action="${1:-status}"
    shift || true

    case "$action" in
        # Core commands (loaded immediately)
        status)         federation_status ;;
        register)       federation_register "$@" ;;
        register-spoke) federation_register_spoke "$@" ;;

        # Removed stub commands (superseded):
        sync-policies)
            log_warn "Command 'federation sync-policies' has been removed"
            echo "Use instead: ./dive spoke policy <CODE> sync"
            return 1
            ;;
        sync-idps)
            log_warn "Command 'federation sync-idps' has been removed"
            echo "IdPs are configured via: ./dive federation-setup configure <spoke>"
            return 1
            ;;
        push-audit)
            log_warn "Command 'federation push-audit' has been removed"
            echo "Audit logs are automatically synced by spoke audit queue"
            return 1
            ;;

        # Federation link management
        link)           federation_link "$@" ;;
        unlink)         federation_unlink "$@" ;;
        verify)         federation_verify "$@" ;;
        verify-all)     federation_verify_all "$@" ;;
        fix)            federation_fix "$@" ;;
        sync-secrets)   federation_sync_secrets "$@" ;;
        list-idps)      federation_list_idps "$@" ;;

        # Federation mappers management
        mappers)        federation_mappers_dispatch "$@" ;;

        # Federation testing
        test)           federation_test "$@" ;;
        health|check)   federation_health_check "$@" ;;

        # Federation diagnostics
        diagnose)       federation_diagnose "$@" ;;

        # Help
        *)              module_federation_help ;;
    esac
}

module_federation_help() {
    echo -e "${BOLD}Federation Commands:${NC}"
    echo ""
    echo -e "${CYAN}Core Commands:${NC}"
    echo "  ${CYAN}status${NC}               Show federation status"
    echo "  ${CYAN}register${NC} <url>       Register instance with hub"
    echo "  ${CYAN}register-spoke${NC} <CODE> Add spoke to federation registry (federated search)"
    echo ""
    echo -e "${CYAN}Testing & Diagnostics:${NC}"
    echo "  ${CYAN}diagnose${NC} <CODE>      Comprehensive federation diagnostic (8 checks)"
    echo "  ${CYAN}health|check${NC}         Run comprehensive federation health checks"
    echo "  ${CYAN}test${NC} <type>          Run federation integration tests"
    echo "  ${CYAN}test${NC} bidirectional    Test bidirectional SSO between spokes"
    echo "    ${GRAY}basic${NC}              Test hub APIs and basic connectivity"
    echo "    ${GRAY}connectivity${NC}       Test cross-instance network connectivity"
    echo "    ${GRAY}auth${NC}               Test authentication flows and SSO"
    echo "    ${GRAY}full${NC}               Run complete test suite"
    echo ""
    echo -e "${CYAN}IdP Link Commands:${NC}"
    echo "  ${GREEN}${BOLD}link${NC} <CODE>         Link IdP for cross-border SSO"
    echo "  ${GREEN}${BOLD}unlink${NC} <CODE>       Remove IdP link"
    echo "  ${GREEN}${BOLD}verify${NC} <CODE>       Verify bidirectional federation (8-point check)"
    echo "  ${GREEN}${BOLD}verify-all${NC}          Verify all configured spokes (8-point check each)"
    echo "  ${GREEN}${BOLD}fix${NC} <CODE>          Fix misconfigured federation (delete & recreate)"
    echo "  ${GREEN}${BOLD}sync-secrets${NC} <CODE> Sync client secrets bidirectionally (after redeploy)"
    echo "  ${GREEN}${BOLD}list-idps${NC}           List configured IdPs"
    echo ""
    echo -e "${CYAN}Mapper Commands:${NC}"
    echo "  ${GREEN}${BOLD}mappers${NC} <cmd>       Manage NATO nation protocol mappers"
    echo "    ${GRAY}list${NC}               List available nation templates"
    echo "    ${GRAY}show${NC} <nation>      Show nation mapper details"
    echo "    ${GRAY}apply${NC}              Apply PII-minimized mappers"
    echo "    ${GRAY}verify${NC}             Verify mapper configuration"
    echo ""
    echo "Examples:"
    echo "  ./dive federation status                        # Show federation status"
    echo "  ./dive federation diagnose EST                  # Run diagnostic for EST spoke"
    echo "  ./dive federation link GBR                      # Link GBR to USA Hub"
    echo "  ./dive federation link EST --retry              # Link with retry on failure"
    echo "  ./dive federation verify EST                    # Verify EST ↔ USA bidirectional"
    echo "  ./dive --instance gbr federation link USA       # Link USA to GBR Spoke"
    echo "  ./dive federation list-idps                     # Show all IdPs"
    echo "  ./dive federation register-spoke HUN            # Enable HUN federated search"
    echo ""
    echo "  ./dive federation test basic                    # Run basic API tests"
    echo "  ./dive federation test full                     # Run complete test suite"
    echo ""
    echo "  ./dive federation mappers list                  # List all NATO nations"
    echo "  ./dive federation mappers apply                 # Apply PII-minimized mappers"
    echo "  ./dive federation mappers verify                # Verify mapper configuration"
    echo ""
}

# =============================================================================
# NOTE: Hub commands are now in hub.sh (module_hub)
# The hub bootstrap command below is kept for backward compatibility
# =============================================================================

# Backward compatibility: hub bootstrap still works from federation module
hub_bootstrap_compat() {
    # Delegate to hub.sh module
    if [ -z "$DIVE_HUB_LOADED" ]; then
        source "${_FEDERATION_MODULES_DIR}/hub.sh" 2>/dev/null || {
            log_error "Failed to load hub.sh module"
            return 1
        }
    fi
    hub_bootstrap "$@"
}
