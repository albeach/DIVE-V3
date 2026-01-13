#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 CLI - Spoke Commands Module (Direct Loading Architecture)
# =============================================================================
# Commands: init, generate-certs, register, status, sync, health, up, down, logs
# For distributed spoke deployments (disabled in pilot mode by default)
# =============================================================================
# Version: 4.0.0
# Date: 2026-01-07
# Refactored: Direct loading architecture - reduced from 2937 to ~300 lines
# =============================================================================

# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Load NATO countries database (associative arrays can't be exported, must check array size)
# We use declare -p to check if the array exists and has been populated
if ! declare -p NATO_COUNTRIES &>/dev/null || [ ${#NATO_COUNTRIES[@]} -eq 0 ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../nato-countries.sh"
fi

# =============================================================================
# DIRECT LOADING OF SPOKE SUB-MODULES (No Lazy Loading)
# Benefits: Immediate availability, better performance, cleaner architecture
# =============================================================================

_SPOKE_MODULES_DIR="${DIVE_ROOT}/scripts/dive-modules/spoke"

# Load all sub-modules directly
source "${_SPOKE_MODULES_DIR}/spoke-init.sh"
source "${_SPOKE_MODULES_DIR}/spoke-deploy.sh"
source "${_SPOKE_MODULES_DIR}/spoke-register.sh"
source "${_SPOKE_MODULES_DIR}/status.sh"
source "${_SPOKE_MODULES_DIR}/federation.sh"
source "${_SPOKE_MODULES_DIR}/verification.sh"
source "${_SPOKE_MODULES_DIR}/maintenance.sh"
source "${_SPOKE_MODULES_DIR}/spoke-policy.sh"
source "${_SPOKE_MODULES_DIR}/spoke-countries.sh"
source "${_SPOKE_MODULES_DIR}/localization.sh"
source "${_SPOKE_MODULES_DIR}/spoke-kas.sh"
source "${_SPOKE_MODULES_DIR}/pki.sh"
source "${_SPOKE_MODULES_DIR}/operations.sh"
source "${_SPOKE_MODULES_DIR}/spoke-cloudflare.sh"
source "${_SPOKE_MODULES_DIR}/spoke-drift.sh"
source "${_SPOKE_MODULES_DIR}/spoke-failover.sh"
source "${_SPOKE_MODULES_DIR}/spoke-fix-hostname.sh"
source "${_SPOKE_MODULES_DIR}/spoke-verification.sh"
source "${_SPOKE_MODULES_DIR}/spoke-federation-health.sh"

# Load new pipeline modules (consolidated architecture)
source "${_SPOKE_MODULES_DIR}/pipeline/spoke-pipeline.sh" 2>/dev/null || true

# =============================================================================
# DIRECT LOADING COMPLETE - All functions loaded from sub-modules
# =============================================================================

module_spoke() {
    local action="${1:-help}"
    shift || true

    # Check if pilot mode is enabled - some spoke commands are disabled
    local pilot_disabled_actions="init generate-certs up down"
    if [ "$PILOT_MODE" = true ]; then
        for disabled in $pilot_disabled_actions; do
            if [ "$action" = "$disabled" ]; then
                log_error "Spoke deployment command '$action' is disabled in pilot mode"
                echo ""
                echo -e "${YELLOW}In pilot mode, partners register as SP Clients, not full Spokes.${NC}"
                echo ""
                echo "To register as an SP Client (OAuth/OIDC), use:"
                echo "  ./dive sp register"
                echo ""
                echo "To disable pilot mode (for full spoke deployment):"
                echo "  export DIVE_PILOT_MODE=false"
                echo "  ./dive spoke $action $@"
                return 1
            fi
        done
    fi

    case "$action" in
        init)           spoke_init "$@" ;;
        setup|wizard)
            log_warn "Deprecated: Use 'spoke init' instead (removal in v5.0)"
            spoke_setup_wizard "$@"
            ;;
        deploy)         spoke_deploy "$@" ;;
        generate-certs) spoke_generate_certs "$@" ;;
        gen-certs)      spoke_generate_certs "$@" ;;
        rotate-certs)   spoke_rotate_certs "$@" ;;
        init-keycloak)  spoke_init_keycloak ;;
        reinit-client)  spoke_reinit_client ;;
        fix-client)     spoke_reinit_client ;;  # Alias for reinit-client
        fix-mappers)    spoke_fix_mappers "$@" ;;    # Fix missing protocol mappers
        regenerate-theme) spoke_regenerate_theme "$@" ;; # Regenerate Keycloak theme with locales
        register)       spoke_register "$@" ;;
        token-refresh)  spoke_token_refresh "$@" ;;
        opal-token)     spoke_opal_token "$@" ;;
        activate-opal-token) spoke_activate_opal_token "$@" ;;
        status)         spoke_status "$@" ;;
        health)         spoke_health "$@" ;;
        verify)         spoke_verify "$@" ;;
        dashboard)      spoke_dashboard "$@" ;;
        sync)           spoke_sync ;;
        heartbeat)      spoke_heartbeat ;;
        policy)         spoke_policy "$@" ;;
        seed)           spoke_seed "$@" ;;
        list-peers)     spoke_list_peers ;;
        up|start)       spoke_up ;;
        down|stop)      spoke_down ;;
        clean)          spoke_clean ;;
        purge)
            log_warn "Deprecated: Use 'spoke clean' instead (removal in v5.0)"
            spoke_clean
            ;;
        logs)           spoke_logs "$@" ;;
        reset)          spoke_reset ;;
        check-drift)
            spoke_check_drift "$@"
            ;;
        check-all-drift|check-all)
            spoke_check_all_drift "$@"
            ;;
        update-compose|update)
            spoke_update_compose "$@"
            ;;
        teardown)
            log_warn "Deprecated: Use 'spoke clean' for volume cleanup or 'spoke down' to stop services (removal in v5.0)"
            spoke_teardown "$@"
            ;;

        failover)       spoke_failover "$@" ;;
        maintenance)    spoke_maintenance "$@" ;;
        audit-status)   spoke_audit_status ;;
        sync-secrets)   spoke_sync_secrets "$@" ;;
        sync-federation-secrets) spoke_sync_federation_secrets "$@" ;;
        sync-all-secrets) spoke_sync_all_secrets ;;
        # sync-client-secret is an alias for sync-secrets (same functionality)
        sync-client-secret) spoke_sync_secrets "$@" ;;
        list-countries) spoke_list_countries "$@" ;;
        countries)
            log_warn "Deprecated: Use 'spoke list-countries' instead (removal in v5.0)"
            spoke_list_countries "$@"
            ;;

        ports)          spoke_show_ports "$@" ;;
        country-info)   spoke_country_info "$@" ;;
        validate-country) spoke_validate_country "$@" ;;
        generate-theme) spoke_generate_theme "$@" ;;
        gen-theme)      spoke_generate_theme "$@" ;;
        batch-deploy)   spoke_batch_deploy "$@" ;;
        batch)          spoke_batch_deploy "$@" ;;
        verify-federation) spoke_verify_federation "$@" ;;
        verify-fed)     spoke_verify_federation "$@" ;;
        kas)            spoke_kas "$@" ;;
        localize)       spoke_localize "$@" ;;
        localize-mappers) spoke_localize_mappers "$@" ;;
        localize-users) spoke_localize_users "$@" ;;

        # PKI Management
        pki-request)    spoke_pki_request "$@" ;;
        pki-import)     spoke_pki_import "$@" ;;

        # Environment Synchronization
        env-sync)
            local subcommand="${1:-status}"
            shift || true
            case "$subcommand" in
                status)         spoke_env_status "$@" ;;
                force-recreate) spoke_force_recreate "$@" ;;
                validate)       spoke_validate_env_vars "$@" ;;
                *)              log_error "Unknown env-sync subcommand: $subcommand"
                             echo "Available: status, force-recreate, validate"
                             ;;
            esac
            ;;
        env-status)     spoke_env_status "$@" ;;  # Alias
        force-recreate) spoke_force_recreate "$@" ;;  # Alias

        # Secret Management
        validate-secrets) spoke_validate_secrets_comprehensive "$@" ;;
        secret-report)    spoke_generate_secret_report "$@" ;;

        # Federation Health
        federation-health) spoke_federation_health_check "$@" ;;
        federation-report) spoke_generate_federation_health_report "$@" ;;

        # Fix/Migration Commands
        fix-hostname)
            if [ "$1" = "--all" ]; then
                spoke_fix_all_hostnames
            else
                spoke_fix_keycloak_hostname "$@"
            fi
            ;;

        *)              module_spoke_help ;;
    esac
}

module_spoke_help() {
    print_header
    echo -e "${BOLD}Spoke Commands (for distributed federation):${NC}"
    echo ""

    if [ "$PILOT_MODE" = true ]; then
        echo -e "${YELLOW}⚠️  Pilot mode is enabled. Some spoke commands are disabled.${NC}"
        echo "   Use './dive sp register' to register as an SP Client instead."
        echo "   Set DIVE_PILOT_MODE=false to enable full spoke deployment."
        echo ""
    fi

    echo -e "${CYAN}🚀 Quick Deploy (Phase 2):${NC}"
    echo "  deploy <code> [name]   Full automated deployment (init→up→wait→init-all→register)"
    echo "                         Deploys a complete spoke in <120 seconds"
    echo ""

    echo -e "${CYAN}Setup & Initialization:${NC}"
    echo "  init                   Interactive setup wizard (recommended)"
    echo "  init <code> <name>     Quick initialization with defaults"
    echo "  setup / wizard         Launch interactive setup wizard"
    echo ""

    echo -e "${CYAN}Environment Management:${NC}"
    echo "  env-sync status        Show environment variable status and validation"
    echo "  env-sync force-recreate Force recreation of all containers (for troubleshooting)"
    echo "  env-sync validate      Validate environment variables in running containers"
    echo ""

    echo -e "${CYAN}Secret Management:${NC}"
    echo "  validate-secrets       Comprehensive secret validation and accessibility testing"
    echo "  secret-report          Generate detailed secret validation report"
    echo ""

    echo -e "${CYAN}Federation Health:${NC}"
    echo "  federation-health      Comprehensive federation health check (IdPs, tokens, cross-instance)"
    echo "  federation-report      Generate detailed federation health report"
    echo ""
    echo -e "${DIM}  The wizard helps you configure:${NC}"
    echo -e "${DIM}    • Hostnames (dive25.com, custom domain, or IP)${NC}"
    echo -e "${DIM}    • Cloudflare tunnel (optional auto-setup)${NC}"
    echo -e "${DIM}    • Secure password generation${NC}"
    echo -e "${DIM}    • TLS certificates${NC}"
    echo ""

    echo -e "${CYAN}Certificates:${NC}"
    echo "  generate-certs         Generate X.509 certificates for mTLS"
    echo "  rotate-certs           Rotate existing certificates (with backup)"
    echo ""
    echo -e "${CYAN}PKI Management:${NC}"
    echo "  pki-request            Generate CSR for policy signing certificate"
    echo "  pki-import             Import Hub-signed certificate and trust chain"
    echo ""

    echo -e "${CYAN}Fix/Migration:${NC}"
    echo "  fix-hostname           Fix Keycloak issuer URL configuration (Keycloak v26+)"
    echo "  fix-hostname --all     Fix all initialized spokes"
    echo ""

    echo -e "${CYAN}Registration (Phase 3):${NC}"
    echo "  register               Register this spoke with the Hub (includes CSR)"
    echo "  register --poll        Register and poll for approval (auto-configure token)"
    echo "  token-refresh          Refresh spoke Hub API token before expiry"
    echo "  opal-token             Provision OPAL client JWT from Hub's OPAL server"
    echo "  status                 Show spoke federation status (incl. token/cert info)"
    echo ""

    echo -e "${CYAN}Operations:${NC}"
    echo "  up                     Start spoke services"
    echo "  down                   Stop spoke services"
    echo "  clean                  Remove all containers, volumes, and optionally config"
    echo "                         (Use before redeploy to fix password mismatches)"
    echo "  logs [service]         View service logs"
    echo "  seed [count]           Seed spoke database with test resources (default: 5000)"
    echo "  health                 Check service health"
    echo "  verify                 Run 8-point connectivity test"
    echo "  dashboard              Show real-time orchestration dashboard"
    echo ""

    echo -e "${CYAN}Cleanup (Phase 2):${NC}"
    echo "  reset                  Clean spoke data, preserve config (re-initialize)"
    echo "  teardown [--notify-hub]  Full removal of spoke (DESTRUCTIVE)"
    echo ""

    echo -e "${CYAN}Federation:${NC}"
    echo "  sync                   Force policy sync from Hub"
    echo "  heartbeat              Send manual heartbeat to Hub"
    echo "  list-peers             Show all registered spokes from hub perspective"
    echo "  sync-secrets           Synchronize frontend secrets with Keycloak"
    echo "  sync-federation-secrets Synchronize usa-idp secrets with Hub"
    echo "  sync-all-secrets       Synchronize secrets for all running spokes"
    echo ""

    echo -e "${CYAN}Fixes & Maintenance:${NC}"
    echo "  fix-mappers            Fix missing protocol mappers (ACR/AMR/DIVE attributes)"
    echo "  fix-client             Reinitialize Keycloak client configuration"
    echo "  regenerate-theme       Regenerate Keycloak theme with locale support"
    echo ""

    echo -e "${CYAN}Policy Management (Phase 4):${NC}"
    echo "  policy status          Show policy version, sync status, signature"
    echo "  policy sync            Force policy sync from hub with verification"
    echo "  policy verify          Verify current policy bundle signature"
    echo "  policy version         Show current policy version"
    echo ""

    echo -e "${CYAN}Resilience (Phase 5):${NC}"
    echo "  failover [subcmd]      Circuit breaker management"
    echo "    status               Show failover state and metrics"
    echo "    force-open           Force circuit to OPEN (offline mode)"
    echo "    force-closed         Force circuit to CLOSED (normal mode)"
    echo "    reset                Reset metrics and return to CLOSED"
    echo ""
    echo "  maintenance [subcmd]   Maintenance mode control"
    echo "    status               Show maintenance status"
    echo "    enter [reason]       Enter maintenance mode"
    echo "    exit                 Exit maintenance mode"
    echo ""
    echo "  audit-status           Show audit queue status and metrics"
    echo ""

    echo -e "${CYAN}NATO Country Management:${NC}"
    echo "  list-countries         List all 32 NATO member countries"
    echo "  countries              Alias for list-countries"
    echo "  ports [CODE]           Show port assignments (all or specific country)"
    echo "  country-info <CODE>    Show detailed info for a country"
    echo "  validate-country <CODE> Validate a country code"
    echo "  generate-theme <CODE>  Generate Keycloak theme for a country"
    echo "  generate-theme --all   Generate themes for all 32 NATO countries"
    echo ""

    echo -e "${CYAN}Localized Attributes (NATO Interoperability):${NC}"
    echo "  localize <CODE>        Full localization: mappers + users (recommended)"
    echo "  localize-mappers <CODE> Configure protocol mappers (local → DIVE V3)"
    echo "  localize-users <CODE>  Seed users with localized attributes"
    echo ""
    echo -e "${DIM}  Maps country-specific attribute names to DIVE V3 standard:${NC}"
    echo -e "${DIM}    FRA: niveau_habilitation → clearance${NC}"
    echo -e "${DIM}    DEU: sicherheitsfreigabe → clearance${NC}"
    echo -e "${DIM}    POL: poziom_bezpieczenstwa → clearance${NC}"
    echo -e "${DIM}    HUN: biztonsagi_szint → clearance${NC}"
    echo ""

    echo -e "${CYAN}Batch Operations:${NC}"
    echo "  batch-deploy <CODES>   Deploy multiple countries (e.g., ALB POL NOR)"
    echo "  batch-deploy --all     Deploy all 32 NATO countries (not recommended locally)"
    echo "  verify-federation      Verify federation health for running spokes"
    echo "  verify-federation <CODES> Verify specific countries"
    echo ""

    echo -e "${CYAN}KAS Management:${NC}"
    echo "  kas init [code]        Initialize KAS for a spoke (certs, registry)"
    echo "  kas status [code]      Show spoke KAS status"
    echo "  kas health [code]      Detailed KAS health check"
    echo "  kas register [code]    Register spoke KAS in federation registry"
    echo "  kas unregister [code]  Remove spoke KAS from federation registry"
    echo "  kas logs [code] [-f]   View spoke KAS logs"
    echo ""

    echo -e "${BOLD}Quick Start (One Command - Phase 2):${NC}"
    echo -e "  ${GREEN}./dive spoke deploy NZL 'New Zealand'${NC}  # Deploy in <120 seconds"
    echo ""

    echo -e "${BOLD}Quick Start (Interactive):${NC}"
    echo -e "  ${GREEN}./dive spoke init${NC}           # Launch setup wizard"
    echo ""

    echo -e "${BOLD}Quick Start (Non-Interactive):${NC}"
    echo "  1. ./dive spoke init NZL 'New Zealand Defence'"
    echo "  2. Edit instances/nzl/.env (auto-generated with passwords)"
    echo "  3. ./dive spoke up"
    echo "  4. ./dive spoke register NZL"
    echo "  5. Wait for Hub admin approval"
    echo "  6. Add SPOKE_OPAL_TOKEN to .env"
    echo ""

    echo -e "${BOLD}Verification:${NC}"
    echo "  ./dive spoke verify NZL   # 8-point connectivity test"
    echo "  ./dive spoke health NZL   # Service health check"
    echo ""

    echo -e "${BOLD}Cloudflare Tunnel Setup:${NC}"
    echo "  The setup wizard can auto-configure Cloudflare tunnels."
    echo "  This makes your spoke accessible at <code>-*.dive25.com"
    echo ""
    echo "  Manual setup:"
    echo "    1. Create tunnel at https://one.dash.cloudflare.com"
    echo "    2. Copy tunnel token"
    echo "    3. Add to .env: TUNNEL_TOKEN=<token>"
    echo "    4. Restart: ./dive spoke down && ./dive spoke up"
    echo ""

    echo -e "${BOLD}Environment Variables:${NC}"
    echo "  DIVE_PILOT_MODE        Set to 'false' to enable spoke deployment"
    echo "  DIVE_HUB_URL           Override Hub URL for registration"
    echo "  DIVE_INSTANCE          Set default instance code"
    echo ""
}