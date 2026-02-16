#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Deployment Rollback Module (Consolidated)
# =============================================================================
# Rollback, cleanup, and recovery procedures
# =============================================================================
# Version: 5.0.0 (Module Consolidation)
# Date: 2026-01-22
#
# Consolidates:
#   (Formerly: hub/cleanup.sh, hub/reset.sh — removed Phase 13b)
#   - Rollback logic from deploy.sh
# =============================================================================

# Prevent multiple sourcing
[ -n "${DIVE_DEPLOYMENT_ROLLBACK_LOADED:-}" ] && return 0
export DIVE_DEPLOYMENT_ROLLBACK_LOADED=1

# =============================================================================
# LOAD DEPENDENCIES
# =============================================================================

DEPLOYMENT_DIR="$(dirname "${BASH_SOURCE[0]}")"
MODULES_DIR="$(dirname "$DEPLOYMENT_DIR")"

if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "${MODULES_DIR}/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Load state module
if [ -f "${MODULES_DIR}/orchestration/state.sh" ]; then
    source "${MODULES_DIR}/orchestration/state.sh"
fi

# =============================================================================
# ROLLBACK FUNCTIONS
# =============================================================================

##
# Rollback a failed deployment
#
# Arguments:
#   $1 - Deployment type: "hub" or "spoke"
#   $2 - Instance code (for spoke)
#   $3 - Rollback reason
#
# Returns:
#   0 - Rollback successful
#   1 - Rollback failed
##
rollback_deployment() {
    local deployment_type="${1:-spoke}"
    local instance_code="${2:-}"
    local reason="${3:-Deployment failed}"

    local code_lower=$(lower "$instance_code")

    log_warn "Rolling back $deployment_type ${instance_code:-} deployment..."
    log_warn "Reason: $reason"

    # Update state
    if type orch_db_set_state &>/dev/null; then
        orch_db_set_state "${instance_code:-HUB}" "ROLLING_BACK" "$reason"
    fi

    if [ "$deployment_type" = "hub" ]; then
        rollback_hub
    else
        rollback_spoke "$instance_code"
    fi

    # Update state
    if type orch_db_set_state &>/dev/null; then
        orch_db_set_state "${instance_code:-HUB}" "CLEANUP" "Rollback complete"
    fi

    log_success "Rollback complete for $deployment_type ${instance_code:-}"
    return 0
}

##
# Rollback Hub deployment
##
rollback_hub() {
    log_info "Rolling back Hub deployment..."

    # Stop containers
    cd "$DIVE_ROOT"
    docker compose -f docker-compose.hub.yml down 2>/dev/null || true

    # Don't remove volumes - preserve data if possible

    log_success "Hub rollback complete"
}

##
# Rollback Spoke deployment
##
rollback_spoke() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    log_info "Rolling back Spoke $instance_code deployment..."

    if [ -d "$spoke_dir" ] && [ -f "${spoke_dir}/docker-compose.yml" ]; then
        cd "$spoke_dir"
        docker compose down 2>/dev/null || true
        cd - >/dev/null
    fi

    # Remove any running containers
    docker ps -a --filter "name=dive-spoke-${code_lower}" -q | grep . | xargs docker rm -f 2>/dev/null || true

    log_success "Spoke $instance_code rollback complete"
}

# =============================================================================
# CLEANUP FUNCTIONS
# =============================================================================

##
# Clean up deployment (full removal)
#
# Arguments:
#   $1 - Target: "hub", "spoke", "all", or instance code
#   $2 - Options: --force
##
cmd_cleanup() {
    local target="${1:-}"
    local force="${2:-}"

    if [ "$target" = "--all" ] || [ "$target" = "-a" ]; then
        cleanup_all "$force"
    elif [ "$target" = "hub" ]; then
        cleanup_hub "$force"
    elif [ -n "$target" ]; then
        cleanup_spoke "$target" "$force"
    else
        echo "Usage: ./dive cleanup <target> [--force]"
        echo ""
        echo "Targets:"
        echo "  --all       Clean all (Hub + all Spokes + volumes)"
        echo "  hub         Clean Hub deployment"
        echo "  <CODE>      Clean specific Spoke"
        echo ""
        echo "Options:"
        echo "  --force     Skip confirmation prompts"
        return 1
    fi
}

##
# Clean all deployments
##
cleanup_all() {
    local force="$1"

    if [ "$force" != "--force" ]; then
        log_warn "This will remove ALL DIVE deployments including data!"
        read -p "Are you sure? (yes/no): " confirm
        if [ "$confirm" != "yes" ]; then
            log_info "Cleanup cancelled"
            return 0
        fi
    fi

    log_warn "Cleaning ALL DIVE deployments..."

    # Stop and remove Hub
    cleanup_hub "--force"

    # Stop and remove all Spokes
    for spoke_dir in "${DIVE_ROOT}/instances"/*/; do
        [ -d "$spoke_dir" ] || continue
        local code=$(basename "$spoke_dir")
        cleanup_spoke "$code" "--force"
    done

    # Remove shared network
    docker network rm dive-shared 2>/dev/null || true

    # Remove volumes
    docker volume ls -q --filter "name=dive" | grep . | xargs docker volume rm 2>/dev/null || true

    # Prune system
    docker system prune -f 2>/dev/null || true

    log_success "All DIVE deployments cleaned"
}

##
# Clean Hub deployment
##
cleanup_hub() {
    local force="$1"

    if [ "$force" != "--force" ]; then
        log_warn "This will remove Hub deployment!"
        read -p "Continue? (y/n): " confirm
        [ "$confirm" != "y" ] && return 0
    fi

    log_info "Cleaning Hub deployment..."

    cd "$DIVE_ROOT"
    docker compose -f docker-compose.hub.yml down -v 2>/dev/null || true

    # Remove Hub containers
    docker ps -a --filter "name=dive-hub" -q | grep . | xargs docker rm -f 2>/dev/null || true

    # Remove Hub volumes
    docker volume ls -q --filter "name=dive-hub" | grep . | xargs docker volume rm 2>/dev/null || true

    # Clean data directory
    rm -rf "${DIVE_ROOT}/data/hub"/* 2>/dev/null || true

    log_success "Hub cleanup complete"
}

##
# Clean Spoke deployment
##
cleanup_spoke() {
    local instance_code="$1"
    local force="$2"
    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")

    if [ "$force" != "--force" ]; then
        log_warn "This will remove Spoke $code_upper deployment!"
        read -p "Continue? (y/n): " confirm
        [ "$confirm" != "y" ] && return 0
    fi

    log_info "Cleaning Spoke $code_upper deployment..."

    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    if [ -d "$spoke_dir" ] && [ -f "${spoke_dir}/docker-compose.yml" ]; then
        cd "$spoke_dir"
        docker compose down -v 2>/dev/null || true
        cd - >/dev/null
    fi

    # Remove containers
    docker ps -a --filter "name=dive-spoke-${code_lower}" -q | grep . | xargs docker rm -f 2>/dev/null || true

    # Remove volumes
    docker volume ls -q --filter "name=dive-spoke-${code_lower}" | grep . | xargs docker volume rm 2>/dev/null || true

    # Remove instance directory
    rm -rf "$spoke_dir" 2>/dev/null || true

    log_success "Spoke $code_upper cleanup complete"
}

##
# Nuke everything (emergency full reset)
##
cmd_nuke() {
    log_warn "⚠️  NUCLEAR OPTION: This will destroy EVERYTHING!"
    log_warn "All containers, volumes, networks, and data will be removed."
    echo ""
    read -p "Type 'NUKE' to confirm: " confirm

    if [ "$confirm" != "NUKE" ]; then
        log_info "Nuke cancelled"
        return 0
    fi

    log_warn "Nuking all DIVE resources..."

    # Stop all DIVE containers
    docker ps -a --filter "name=dive" -q | grep . | xargs docker stop 2>/dev/null || true
    docker ps -a --filter "name=dive" -q | grep . | xargs docker rm -f 2>/dev/null || true

    # Remove all DIVE volumes
    docker volume ls -q --filter "name=dive" | grep . | xargs docker volume rm 2>/dev/null || true

    # Remove all DIVE networks
    docker network ls --filter "name=dive" -q | grep . | xargs docker network rm 2>/dev/null || true

    # Clean instance directories
    rm -rf "${DIVE_ROOT}/instances"/* 2>/dev/null || true

    # Clean data directories
    rm -rf "${DIVE_ROOT}/data"/* 2>/dev/null || true

    # Clean logs
    rm -rf "${DIVE_ROOT}/logs"/* 2>/dev/null || true

    # Prune Docker system
    docker system prune -af --volumes 2>/dev/null || true

    log_success "☢️  NUKE COMPLETE - All DIVE resources destroyed"
    echo ""
    echo "To redeploy:"
    echo "  ./dive hub deploy"
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f rollback_deployment
export -f rollback_hub
export -f rollback_spoke
export -f cmd_cleanup
export -f cleanup_all
export -f cleanup_hub
export -f cleanup_spoke
export -f cmd_nuke

log_verbose "Rollback module loaded"
