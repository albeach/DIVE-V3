#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 CLI - Hub Management Module (Main Dispatcher)
# =============================================================================
# Main hub dispatcher with direct loading of sub-modules for maintainability
# Each sub-module < 500 lines for effective AI-assisted development
# =============================================================================

# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# DIRECT LOADING OF HUB SUB-MODULES (No Lazy Loading)
# =============================================================================
# Benefits:
# - Immediate function availability (no loading delay)
# - Better performance than lazy loading
# - Cleaner architecture than one massive file
# - Files < 500 lines for AI-assisted development
# =============================================================================

# =============================================================================
# LAZY LOADING INFRASTRUCTURE (Optimized)
# =============================================================================
# Benefits of this approach:
# - Functions loaded on-demand (faster startup)
# - Modular organization for AI-assisted development
# - Each sub-module < 500 lines for easy review
# - Better than massive monolithic files
# =============================================================================

# Sub-modules directory
_HUB_MODULES_DIR="${DIVE_ROOT}/scripts/dive-modules/hub"

# Lazy loading functions for each sub-module
_load_hub_init() {
    [ -z "$DIVE_HUB_INIT_LOADED" ] && source "${_HUB_MODULES_DIR}/init.sh"
}

_load_hub_services() {
    [ -z "$DIVE_HUB_SERVICES_LOADED" ] && source "${_HUB_MODULES_DIR}/services.sh"
}

_load_hub_deploy() {
    [ -z "$DIVE_HUB_DEPLOY_LOADED" ] && source "${_HUB_MODULES_DIR}/deploy.sh"
}

_load_hub_spokes() {
    [ -z "$DIVE_HUB_SPOKES_LOADED" ] && source "${_HUB_MODULES_DIR}/spokes.sh"
}

_load_hub_status() {
    [ -z "$DIVE_HUB_STATUS_LOADED" ] && source "${_HUB_MODULES_DIR}/status.sh"
}

_load_hub_policy() {
    [ -z "$DIVE_HUB_POLICY_LOADED" ] && source "${_HUB_MODULES_DIR}/policy.sh"
}

_load_hub_amr() {
    [ -z "$DIVE_HUB_AMR_LOADED" ] && source "${_HUB_MODULES_DIR}/amr.sh"
}

_load_hub_seed() {
    [ -z "$DIVE_HUB_SEED_LOADED" ] && source "${_HUB_MODULES_DIR}/seed.sh"
}

_load_hub_reset() {
    [ -z "$DIVE_HUB_RESET_LOADED" ] && source "${_HUB_MODULES_DIR}/reset.sh"
}

_load_hub_fix() {
    [ -z "$DIVE_HUB_FIX_LOADED" ] && source "${_HUB_MODULES_DIR}/fix.sh"
}

_load_hub_cleanup() {
    [ -z "$DIVE_HUB_CLEANUP_LOADED" ] && source "${_HUB_MODULES_DIR}/cleanup.sh"
}

# Mark hub module as loaded
export DIVE_HUB_LOADED=1

# =============================================================================
# MODULE DISPATCH
# =============================================================================

module_hub() {
    local action="${1:-help}"
    shift || true

    case "$action" in
        deploy)         _load_hub_deploy && hub_deploy "$@" ;;
        init)           _load_hub_init && hub_init "$@" ;;
        up|start)       _load_hub_services && hub_up "$@" ;;
        down|stop)      _load_hub_services && hub_down "$@" ;;
        reset)          _load_hub_reset && hub_reset "$@" ;;
        status)         _load_hub_status && hub_status "$@" ;;
        health)         _load_hub_status && hub_health "$@" ;;
        verify)         _load_hub_status && hub_verify "$@" ;;
        fix)            _load_hub_fix && hub_fix "$@" ;;
        cleanup-legacy) _load_hub_cleanup && hub_cleanup_legacy "$@" ;;
        logs)           _load_hub_status && hub_logs "$@" ;;
        spokes)         _load_hub_spokes && hub_spokes "$@" ;;
        push-policy)    _load_hub_policy && hub_push_policy "$@" ;;
        seed)           _load_hub_seed && hub_seed "$@" ;;
        amr)            _load_hub_amr && hub_amr "$@" ;;

        # Legacy compatibility
        # Deprecated aliases (backwards compatibility)
        bootstrap)
            log_warn "Deprecated: Use 'hub deploy' instead (removal in v5.0)"
            hub_deploy "$@"
            ;;
        instances)
            log_warn "Deprecated: Use 'hub spokes list' instead (removal in v5.0)"
            hub_spokes list "$@"
            ;;

        help|*)      module_hub_help ;;
    esac
}

module_hub_help() {
    echo -e "${BOLD}DIVE Hub Commands:${NC}"
    echo ""
    echo -e "${CYAN}Deployment:${NC}"
    echo "  deploy              Full hub deployment (init → up → configure)"
    echo "  init                Initialize hub directories and config"
    echo "  up, start           Start hub services"
    echo "  down, stop          Stop hub services"
    echo "  reset               Nuke and redeploy (development only, requires 'RESET' confirmation)"
    echo "  seed [count]        Seed test users and ZTDF resources (default: 5000)"
    echo ""
    echo -e "${CYAN}Status & Verification:${NC}"
    echo "  status              Show comprehensive hub status"
    echo "  health              Check all service health"
    echo "  verify              10-point hub verification check (Phase 6)"
    echo "  fix [type]          Validate and fix configuration issues"
    echo "  cleanup-legacy      Remove orphaned realms, clients, and IdPs"
    echo "  logs [service] [-f] View logs (optionally follow)"
    echo ""
    echo -e "${CYAN}Spoke Management:${NC}"
    echo "  spokes list            List all registered spokes"
    echo "  spokes pending         Show spokes pending approval (rich display)"
    echo "  spokes approve <id>    Approve a spoke (interactive with scope selection)"
    echo "  spokes reject <id>     Reject a spoke (with reason)"
    echo "  spokes suspend <id>    Suspend a spoke"
    echo "  spokes unsuspend <id>  Reactivate a suspended spoke [--retry-federation]"
    echo "  spokes revoke <id>     Permanently revoke a spoke"
    echo "  spokes token <id>      Generate new token for a spoke"
    echo "  spokes rotate-token <id>  Rotate (revoke + regenerate) spoke token"
    echo ""
    echo -e "${CYAN}Policy:${NC}"
    echo "  push-policy [layers] Push policy update to all spokes"
    echo ""
    echo -e "${CYAN}AMR Management (MFA/AAL):${NC}"
    echo "  amr sync [--user X]     Sync AMR attributes based on credentials"
    echo "  amr set <user> <amr>    Set AMR for a specific user"
    echo "  amr show <user>         Show AMR for a specific user"
    echo ""
    echo -e "${CYAN}Examples:${NC}"
    echo "  ./dive hub deploy"
    echo "  ./dive hub seed 500"
    echo "  ./dive hub spokes approve spoke-fra-abc123"
    echo "  ./dive hub logs backend -f"
}
