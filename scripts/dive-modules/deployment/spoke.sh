#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Spoke Deployment Module (Consolidated Dispatcher)
# =============================================================================
# This module acts as a dispatcher that delegates to the existing pipeline
# implementation in scripts/dive-modules/spoke/
#
# IMPORTANT: This module does NOT reimplement spoke functionality. It delegates
# to the existing, battle-tested implementation to avoid duplication.
# =============================================================================
# Version: 5.0.1 (Delegation Pattern)
# Date: 2026-01-22
#
# Delegates to:
#   - spoke/spoke-deploy.sh (main deployment with pipeline)
#   - spoke/spoke-init.sh (initialization)
#   - spoke/operations.sh (status, logs, etc.)
#   - spoke/pipeline/*.sh (all pipeline phases)
# =============================================================================

# Prevent multiple sourcing
[ -n "${DIVE_DEPLOYMENT_SPOKE_LOADED:-}" ] && return 0
export DIVE_DEPLOYMENT_SPOKE_LOADED=1

# =============================================================================
# LOAD DEPENDENCIES
# =============================================================================

DEPLOYMENT_DIR="$(dirname "${BASH_SOURCE[0]}")"
MODULES_DIR="$(dirname "$DEPLOYMENT_DIR")"
SPOKE_DIR="${MODULES_DIR}/spoke"

# Load common first
if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "${MODULES_DIR}/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# DELEGATE TO EXISTING IMPLEMENTATION
# =============================================================================

# Load the existing spoke modules that have the real implementation
_load_spoke_modules() {
    # Core spoke modules
    [ -f "${SPOKE_DIR}/spoke-deploy.sh" ] && source "${SPOKE_DIR}/spoke-deploy.sh"
    [ -f "${SPOKE_DIR}/spoke-init.sh" ] && source "${SPOKE_DIR}/spoke-init.sh"
    [ -f "${SPOKE_DIR}/operations.sh" ] && source "${SPOKE_DIR}/operations.sh"
    [ -f "${SPOKE_DIR}/maintenance.sh" ] && source "${SPOKE_DIR}/maintenance.sh"
    [ -f "${SPOKE_DIR}/status.sh" ] && source "${SPOKE_DIR}/status.sh"
    [ -f "${SPOKE_DIR}/verification.sh" ] && source "${SPOKE_DIR}/verification.sh"

    # Pipeline modules are loaded by spoke-deploy.sh
}

# Load modules
_load_spoke_modules

# =============================================================================
# MODULE DISPATCH (Delegates to existing implementation)
# =============================================================================

##
# Spoke module command dispatcher
# Delegates to the existing, well-tested spoke implementation
##
module_spoke() {
    local action="${1:-help}"
    shift || true

    # Remote execution: if env is dev/staging, delegate to remote EC2
    # EXCEPTION: prepare, configure, deploy, start-remote run ON the Hub
    if [ -f "${MODULES_DIR}/aws/remote-exec.sh" ]; then
        source "${MODULES_DIR}/aws/remote-exec.sh"
        if is_remote_environment 2>/dev/null; then
            case "$action" in
                prepare|configure|deploy|start-remote)
                    # These run on the Hub — do NOT delegate to spoke EC2
                    # deploy in remote env triggers the ECR-based prepare→start→configure chain
                    log_info "Remote environment: ${action} runs on Hub (ECR-based)"
                    ;;
                *)
                    local spoke_code="${1:-${INSTANCE}}"
                    log_info "Remote environment detected (${ENVIRONMENT}). Delegating to spoke EC2..."
                    remote_spoke_exec "$spoke_code" "$action" "$@"
                    return $?
                    ;;
            esac
        fi
    fi

    case "$action" in
        # === Spoke Authorization (Vault-based) ===
        authorize)
            if [ -f "${SPOKE_DIR}/authorize.sh" ]; then
                source "${SPOKE_DIR}/authorize.sh"
            fi
            if type -t spoke_authorize &>/dev/null; then
                spoke_authorize "$@"
            else
                log_error "spoke_authorize not available - spoke/authorize.sh not loaded"
                return 1
            fi
            ;;

        revoke)
            if [ -f "${SPOKE_DIR}/authorize.sh" ]; then
                source "${SPOKE_DIR}/authorize.sh"
            fi
            if type -t spoke_revoke_authorization &>/dev/null; then
                spoke_revoke_authorization "$@"
            else
                log_error "spoke_revoke_authorization not available"
                return 1
            fi
            ;;

        # === Remote Spoke Deployment (ECR-based, Hub-side operations) ===
        prepare)
            if [ -f "${SPOKE_DIR}/prepare.sh" ]; then
                source "${SPOKE_DIR}/prepare.sh"
            fi
            if type -t spoke_prepare &>/dev/null; then
                spoke_prepare "$@"
            else
                log_error "spoke_prepare not available - spoke/prepare.sh not loaded"
                return 1
            fi
            ;;

        configure)
            if [ -f "${SPOKE_DIR}/configure-remote.sh" ]; then
                source "${SPOKE_DIR}/configure-remote.sh"
            fi
            if type -t spoke_configure_remote &>/dev/null; then
                spoke_configure_remote "$@"
            else
                log_error "spoke_configure_remote not available - spoke/configure-remote.sh not loaded"
                return 1
            fi
            ;;

        start-remote)
            if [ -f "${SPOKE_DIR}/prepare.sh" ]; then
                source "${SPOKE_DIR}/prepare.sh"
            fi
            if type -t _spoke_start_remote &>/dev/null; then
                _spoke_start_remote "$@"
            else
                log_error "_spoke_start_remote not available"
                return 1
            fi
            ;;

        # === Deployment Operations ===
        deploy)
            # Check authorization before deployment
            # Strategy:
            #   1. If --auth-code provided: defer to Hub API validation during registration
            #   2. If no auth code AND Vault accessible: check Vault directly (local mode)
            #   3. If no auth code AND no Vault: skip (standalone/dev mode)
            if [ -n "${SPOKE_AUTH_CODE:-}" ]; then
                log_info "Auth code provided — will validate against Hub API during registration"
            else
                if [ -f "${SPOKE_DIR}/authorize.sh" ]; then
                    source "${SPOKE_DIR}/authorize.sh"
                fi
                if type -t spoke_verify_authorization &>/dev/null; then
                    if ! spoke_verify_authorization "${1:-}"; then
                        return 1
                    fi
                fi
            fi

            # Remote environment: use ECR-based prepare → start → configure chain
            if is_remote_environment 2>/dev/null; then
                local _spoke_code="${1:?Instance code required}"
                log_info "Remote deployment: ECR-based prepare → start → configure"

                # Load prepare module
                if [ -f "${SPOKE_DIR}/prepare.sh" ]; then
                    source "${SPOKE_DIR}/prepare.sh"
                fi

                # Phase 1: Prepare (Hub-side config package generation)
                if type -t spoke_prepare &>/dev/null; then
                    spoke_prepare "$@" || { log_error "Prepare phase failed"; return 1; }
                else
                    log_error "spoke_prepare not available"; return 1
                fi

                # Phase 2: Start (SSH to spoke EC2, pull images, compose up)
                if type -t _spoke_start_remote &>/dev/null; then
                    _spoke_start_remote "$_spoke_code" || { log_error "Start phase failed"; return 1; }
                else
                    log_error "_spoke_start_remote not available"; return 1
                fi

                # Phase 3: Configure (Terraform + federation from Hub)
                if [ -f "${SPOKE_DIR}/configure-remote.sh" ]; then
                    source "${SPOKE_DIR}/configure-remote.sh"
                fi
                if type -t spoke_configure_remote &>/dev/null; then
                    spoke_configure_remote "$_spoke_code" || { log_warn "Configure phase had issues"; }
                else
                    log_warn "spoke_configure_remote not available — run manually: ./dive spoke configure $_spoke_code"
                fi

                log_success "Remote deployment of $_spoke_code complete!"
            else
                # Local environment: use existing pipeline
                if type -t spoke_deploy &>/dev/null; then
                    spoke_deploy "$@"
                else
                    log_error "spoke_deploy not available - spoke-deploy.sh not loaded"
                    return 1
                fi
            fi
            ;;

        up|start)
            if type -t spoke_up &>/dev/null; then
                spoke_up "$@"
            else
                log_error "spoke_up not available"
                return 1
            fi
            ;;

        down|stop)
            if type -t spoke_down &>/dev/null; then
                spoke_down "$@"
            else
                log_error "spoke_down not available"
                return 1
            fi
            ;;

        # === Initialization (delegate to spoke-init.sh) ===
        init)
            if type -t spoke_init &>/dev/null; then
                spoke_init "$@"
            else
                log_error "spoke_init not available - spoke-init.sh not loaded"
                return 1
            fi
            ;;

        setup-wizard)
            if type -t spoke_setup_wizard &>/dev/null; then
                spoke_setup_wizard "$@"
            else
                log_error "spoke_setup_wizard not available"
                return 1
            fi
            ;;

        # === Status & Verification (delegate to operations.sh/status.sh) ===
        status)
            if type -t spoke_status &>/dev/null; then
                spoke_status "$@"
            else
                log_error "spoke_status not available - status.sh module failed to load"
                return 1
            fi
            ;;

        verify|health)
            if type -t spoke_verify &>/dev/null; then
                spoke_verify "$@"
            else
                log_error "spoke_verify not available - verification.sh module failed to load"
                return 1
            fi
            ;;

        verify-all)
            if type -t spoke_verify_all &>/dev/null; then
                spoke_verify_all "$@"
            else
                log_error "spoke_verify_all not available - verification.sh module failed to load"
                return 1
            fi
            ;;

        # === Logs ===
        logs)
            _spoke_logs "$@"
            ;;

        # === Repair Operations (delegate to operations.sh) ===
        restart)
            if type -t spoke_restart &>/dev/null; then
                spoke_restart "$@"
            else
                log_error "spoke_restart not available - operations.sh not loaded"
                return 1
            fi
            ;;

        reload-secrets)
            if type -t spoke_reload_secrets &>/dev/null; then
                spoke_reload_secrets "$@"
            else
                log_error "spoke_reload_secrets not available - operations.sh not loaded"
                return 1
            fi
            ;;

        repair)
            if type -t spoke_repair &>/dev/null; then
                spoke_repair "$@"
            else
                log_error "spoke_repair not available - operations.sh not loaded"
                return 1
            fi
            ;;

        # === Lock Management ===
        clean-locks)
            _spoke_clean_locks "$@"
            ;;

        # === Help ===
        help|*)
            _spoke_help
            ;;
    esac
}

_spoke_logs() {
    local code="${1:?Instance code required}"
    local service="${2:-}"
    local code_lower=$(lower "$code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    if [ -d "$spoke_dir" ] && [ -f "${spoke_dir}/docker-compose.yml" ]; then
        cd "$spoke_dir"
        if [ -n "$service" ]; then
            docker compose logs -f "$service"
        else
            docker compose logs -f
        fi
        cd - >/dev/null
    else
        # Try direct container logs
        if [ -n "$service" ]; then
            docker logs -f "dive-spoke-${code_lower}-${service}" 2>/dev/null
        else
            docker compose -p "dive-spoke-${code_lower}" logs -f 2>/dev/null
        fi
    fi
}

_spoke_clean_locks() {
    local instance_code="${1:-all}"

    if type -t orch_cleanup_stale_locks &>/dev/null; then
        if [ "$instance_code" = "all" ]; then
            orch_cleanup_stale_locks "" 30
        else
            type -t orch_force_unlock &>/dev/null && orch_force_unlock "$instance_code"
        fi
    else
        log_warn "Lock cleanup functions not available"
    fi
}

_spoke_help() {
    cat << 'EOF'
Usage: ./dive spoke <command> [args]

Commands:
  deploy <CODE> [name]        Full spoke deployment (auto-detects local vs remote)
  authorize <CODE> [name]     Pre-authorize a spoke for federation (Vault-based)
  revoke <CODE>               Revoke a spoke's federation authorization
  prepare <CODE>              Generate config package on Hub (ECR-based remote)
  configure <CODE>            Run Terraform + federation from Hub (remote)
  start-remote <CODE>         SSH to spoke EC2 and run deploy.sh
  init <CODE> [name]          Initialize spoke directory only
  setup-wizard                Interactive spoke setup wizard
  up <CODE>                   Start spoke services (local)
  down <CODE>                 Stop spoke services
  status [CODE]               Show spoke status
  verify <CODE>               Verify spoke deployment
  verify-all                  Verify all provisioned spokes
  logs <CODE> [service]       View spoke logs
  clean-locks [CODE]          Clean stale deployment locks

Repair Commands:
  restart <CODE> [service]    Restart spoke services (all or specific)
  reload-secrets <CODE>       Reload secrets from GCP and restart services
  repair <CODE>               Auto-diagnose and fix common issues

Zero-Config Remote Deployment (fresh instance):
  # On the Hub:
  ./dive spoke authorize GBR "United Kingdom"   # Get auth code UUID
  # On the Spoke (any fresh Ubuntu instance):
  ./dive spoke deploy GBR "United Kingdom" --auth-code <UUID>
  # → Prompted for Hub domain (30s timeout → standalone mode)
  # → Auth code validated by Hub API → auto-federated bidirectional SSO

ECR-Based Remote Deployment (AWS):
  ./dive --env dev spoke deploy GBR  # Auto: prepare → start → configure

Local Spoke Deployment:
  ./dive spoke deploy ALB "Albania"  # Full local pipeline (build from source)

Standalone Mode (no federation):
  ./dive spoke deploy GBR            # Skip Hub domain prompt → standalone

Options:
  --auth-code <UUID>          Pre-authorized federation code (from Hub)
  --force                     Force deployment even if already deployed
  --skip-federation           Skip federation setup
  --domain <base>             Custom domain (e.g. gbr.mod.uk)
  --dry-run                   Generate package without shipping (prepare only)

For more help: ./dive help spoke
EOF
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f module_spoke

log_verbose "Spoke deployment module loaded (dispatcher pattern)"
