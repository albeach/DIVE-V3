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

    case "$action" in
        # === Deployment Operations (delegate to spoke-deploy.sh) ===
        deploy)
            if type -t spoke_deploy &>/dev/null; then
                spoke_deploy "$@"
            else
                log_error "spoke_deploy not available - spoke-deploy.sh not loaded"
                return 1
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
                _fallback_spoke_status "$@"
            fi
            ;;

        verify|health)
            if type -t spoke_verify &>/dev/null; then
                spoke_verify "$@"
            else
                _fallback_spoke_verify "$@"
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

# =============================================================================
# FALLBACK FUNCTIONS (used only if main implementation not available)
# =============================================================================

_fallback_spoke_status() {
    local instance_code="${1:-}"

    if [ -z "$instance_code" ]; then
        echo "=== All Spokes ==="
        for spoke_dir in "${DIVE_ROOT}/instances"/*/; do
            [ -d "$spoke_dir" ] || continue
            local code=$(basename "$spoke_dir")
            [ "$code" = "hub" ] && continue
            local containers=$(docker ps --filter "name=dive-spoke-${code}" --format '{{.Names}}' 2>/dev/null | wc -l)
            local healthy=$(docker ps --filter "name=dive-spoke-${code}" --filter "health=healthy" --format '{{.Names}}' 2>/dev/null | wc -l)
            printf "  %-10s %d containers, %d healthy\n" "$(upper "$code")" "$containers" "$healthy"
        done
    else
        local code_lower=$(lower "$instance_code")
        echo "=== Spoke $(upper "$instance_code") Status ==="
        docker ps --filter "name=dive-spoke-${code_lower}" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null
    fi
}

_fallback_spoke_verify() {
    local instance_code="${1:?Instance code required}"
    local code_lower=$(lower "$instance_code")

    log_info "Verifying spoke $(upper "$instance_code")..."

    local checks_passed=0
    local checks_total=4

    # Check containers exist
    local containers=$(docker ps --filter "name=dive-spoke-${code_lower}" --format '{{.Names}}' 2>/dev/null | wc -l)
    if [ "$containers" -gt 0 ]; then
        ((checks_passed++))
        log_verbose "Container check: $containers running"
    fi

    # Check Keycloak health
    local kc_status=$(docker inspect "dive-spoke-${code_lower}-keycloak" --format='{{.State.Health.Status}}' 2>/dev/null || echo "not_found")
    if [ "$kc_status" = "healthy" ]; then
        ((checks_passed++))
        log_verbose "Keycloak health: OK"
    else
        log_verbose "Keycloak health: $kc_status"
    fi

    # Check PostgreSQL health
    local pg_status=$(docker inspect "dive-spoke-${code_lower}-postgres" --format='{{.State.Health.Status}}' 2>/dev/null || echo "not_found")
    if [ "$pg_status" = "healthy" ]; then
        ((checks_passed++))
        log_verbose "PostgreSQL health: OK"
    fi

    # Check MongoDB health
    local mongo_status=$(docker inspect "dive-spoke-${code_lower}-mongodb" --format='{{.State.Health.Status}}' 2>/dev/null || echo "not_found")
    if [ "$mongo_status" = "healthy" ]; then
        ((checks_passed++))
        log_verbose "MongoDB health: OK"
    fi

    echo "Verification: $checks_passed/$checks_total checks passed"
    [ "$checks_passed" -ge 3 ]
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
  deploy <CODE> [name]        Full spoke deployment using pipeline
  init <CODE> [name]          Initialize spoke directory only
  setup-wizard                Interactive spoke setup wizard
  up <CODE>                   Start spoke services
  down <CODE>                 Stop spoke services
  status [CODE]               Show spoke status
  verify <CODE>               Verify spoke deployment
  logs <CODE> [service]       View spoke logs
  clean-locks [CODE]          Clean stale deployment locks

Repair Commands:
  restart <CODE> [service]    Restart spoke services (all or specific)
  reload-secrets <CODE>       Reload secrets from GCP and restart services
  repair <CODE>               Auto-diagnose and fix common issues

Deployment Options:
  --force                     Force deployment even if already deployed
  --legacy                    Use legacy deployment (skip pipeline)
  --skip-federation           Skip federation setup

Examples:
  ./dive spoke deploy ALB "Albania Defence"
  ./dive spoke status FRA
  ./dive spoke logs DEU keycloak
  ./dive spoke verify GBR
  ./dive spoke restart FRA backend
  ./dive spoke reload-secrets FRA
  ./dive spoke repair FRA

For more help: ./dive help spoke
EOF
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f module_spoke

log_verbose "Spoke deployment module loaded (dispatcher pattern)"
