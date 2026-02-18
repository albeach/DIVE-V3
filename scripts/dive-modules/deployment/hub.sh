#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Hub Deployment Module (Consolidated)
# =============================================================================
# Hub deployment, initialization, and management
# =============================================================================
# Version: 5.0.0 (Module Consolidation)
# Date: 2026-01-22
#
# Consolidates:
#   - hub.sh (dispatcher)
#   - hub/deploy.sh, hub/init.sh, hub/seed.sh, hub/services.sh, hub/spokes.sh
# =============================================================================

# Prevent multiple sourcing
[ -n "${DIVE_DEPLOYMENT_HUB_LOADED:-}" ] && return 0
export DIVE_DEPLOYMENT_HUB_LOADED=1

# =============================================================================
# LOAD DEPENDENCIES
# =============================================================================

DEPLOYMENT_DIR="$(dirname "${BASH_SOURCE[0]}")"
MODULES_DIR="$(dirname "$DEPLOYMENT_DIR")"

if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "${MODULES_DIR}/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Load orchestration framework (includes state, errors, circuit-breaker, dependencies)
if [ -f "${MODULES_DIR}/orchestration/framework.sh" ]; then
    source "${MODULES_DIR}/orchestration/framework.sh"
fi

# Load deployment progress module (Phase 3 Sprint 2)
if [ -f "${MODULES_DIR}/utilities/deployment-progress.sh" ]; then
    source "${MODULES_DIR}/utilities/deployment-progress.sh"
fi

# Load pipeline common module (Phase 3: Hub Pipeline Enhancement)
if [ -f "${DEPLOYMENT_DIR}/pipeline-common.sh" ]; then
    source "${DEPLOYMENT_DIR}/pipeline-common.sh"
fi

# Load hub checkpoint module (Phase 3: Hub Pipeline Enhancement)
if [ -f "${DEPLOYMENT_DIR}/hub-checkpoint.sh" ]; then
    source "${DEPLOYMENT_DIR}/hub-checkpoint.sh"
fi

# Load error recovery module (circuit breakers, retry, failure threshold)
if [ -f "${MODULES_DIR}/orchestration/errors.sh" ]; then
    source "${MODULES_DIR}/orchestration/errors.sh"
fi

# =============================================================================
# HUB CONFIGURATION
# =============================================================================

HUB_COMPOSE_FILE="${DIVE_ROOT}/docker-compose.hub.yml"
HUB_DATA_DIR="${DIVE_ROOT}/data/hub"

# Compose command args: includes proxy overlay on EC2 for nginx reverse proxy
# yq commands use $HUB_COMPOSE_FILE (single file); docker compose uses $HUB_COMPOSE_FILES
HUB_COMPOSE_FILES="-f ${HUB_COMPOSE_FILE}"
if [ -n "${HUB_EXTERNAL_ADDRESS:-}" ] && [ "$HUB_EXTERNAL_ADDRESS" != "localhost" ] \
    && [ -f "${DIVE_ROOT}/docker-compose.proxy.yml" ]; then
    HUB_COMPOSE_FILES="${HUB_COMPOSE_FILES} -f ${DIVE_ROOT}/docker-compose.proxy.yml"
    log_info "EC2 mode: nginx reverse proxy overlay enabled"
fi

# =============================================================================
# HUB PIPELINE EXECUTION (Phase 3: Hub Pipeline Enhancement)
# =============================================================================
# Unified pipeline execution with:
#   - Circuit breaker protection for each phase
#   - Failure threshold enforcement
#   - Checkpoint-based resume capability
#   - Deployment lock management
# =============================================================================

##
# Hub phase wrapper functions for circuit breaker integration
# These wrap the actual phase implementations for protected execution
##


# =============================================================================
# SOURCE SUB-MODULES
# =============================================================================
_HUB_DIR="$(dirname "${BASH_SOURCE[0]}")"
source "${_HUB_DIR}/hub-phases.sh"    # Phase functions (database, vault, keycloak, etc.)
source "${_HUB_DIR}/hub-pipeline.sh"  # Pipeline engine, circuit breaker, hub operations
source "${_HUB_DIR}/hub-services.sh"  # Parallel startup, health, Keycloak config, utilities
unset _HUB_DIR

# =============================================================================

##
# Hub module command dispatcher
##
module_hub() {
    local action="${1:-help}"
    shift || true

    # Remote execution: if env is dev/staging, delegate to remote EC2
    if [ -f "${MODULES_DIR}/aws/remote-exec.sh" ]; then
        source "${MODULES_DIR}/aws/remote-exec.sh"
        if is_remote_environment 2>/dev/null; then
            log_info "Remote environment detected (${ENVIRONMENT}). Delegating to EC2..."
            remote_hub_exec "$action" "$@"
            return $?
        fi
    fi

    case "$action" in
        deploy)         hub_deploy "$@" ;;
        init)           hub_init "$@" ;;
        up|start)       hub_up "$@" ;;
        down|stop)      hub_down "$@" ;;
        reset)          hub_reset "$@" ;;
        status)         hub_status "$@" ;;
        verify)         hub_verify "$@" ;;
        logs)           hub_logs "$@" ;;
        seed)           hub_seed "$@" ;;
        spokes)
            local sub="${1:-list}"
            shift || true
            case "$sub" in
                list)    hub_spokes_list "$@" ;;
                *)       echo "Usage: ./dive hub spokes <list>" ;;
            esac
            ;;
        help|*)
            echo "Usage: ./dive hub <command>"
            echo ""
            echo "Commands:"
            echo "  deploy    Full hub deployment"
            echo "  up        Start hub services"
            echo "  down      Stop hub services"
            echo "  status    Show hub status"
            echo "  verify    Run deployment validation tests"
            echo "  reset     Reset hub to clean state"
            echo "  logs      View hub logs"
            echo "  seed      Seed database with test data"
            echo "  spokes    Manage registered spokes"
            ;;
    esac
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f hub_deploy
export -f hub_preflight
export -f hub_init
export -f hub_up
export -f hub_parallel_startup
export -f hub_down
export -f hub_wait_healthy
export -f hub_configure_keycloak
export -f hub_verify_realm
export -f hub_verify
export -f hub_status
export -f hub_reset
export -f hub_logs
export -f hub_seed
export -f hub_spokes_list
export -f module_hub

log_verbose "Hub deployment module loaded (consolidated)"
