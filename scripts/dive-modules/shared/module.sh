#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Shared Tier Module
# =============================================================================
# Manages shared infrastructure services (token store, monitoring, exporters)
# that span across hub and spoke instances.
#
# Services managed:
#   - token-store (Redis): Cross-instance token revocation
#   - exporter-hub-cache: Redis metrics exporter for hub cache
#   - exporter-token-store: Redis metrics exporter for token store
#   - prometheus: Metrics collection
#   - grafana: Metrics visualization (if present)
# =============================================================================

# Prevent multiple sourcing
[ -n "${DIVE_SHARED_MODULE_LOADED:-}" ] && return 0
export DIVE_SHARED_MODULE_LOADED=1

# =============================================================================
# LOAD DEPENDENCIES
# =============================================================================

_SHARED_DIR="$(dirname "${BASH_SOURCE[0]}")"
_MODULES_DIR="$(dirname "$_SHARED_DIR")"

if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "${_MODULES_DIR}/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# CONFIGURATION
# =============================================================================

SHARED_COMPOSE_DIR="${DIVE_ROOT}/docker/instances/shared"
SHARED_COMPOSE_FILE="${SHARED_COMPOSE_DIR}/docker-compose.yml"

# =============================================================================
# SHARED TIER COMMANDS
# =============================================================================

##
# Start shared tier services
##
shared_up() {
    log_info "Starting shared tier services..."

    if [ ! -f "$SHARED_COMPOSE_FILE" ]; then
        log_error "Shared compose file not found: $SHARED_COMPOSE_FILE"
        log_error "  Try: ./dive hub deploy first"
        return 1
    fi

    docker compose -f "$SHARED_COMPOSE_FILE" up -d "$@"
    local exit_code=$?

    if [ $exit_code -eq 0 ]; then
        log_success "Shared tier services started"
    else
        log_error "Failed to start shared tier services"
    fi
    return $exit_code
}

##
# Stop shared tier services
##
shared_down() {
    log_info "Stopping shared tier services..."

    if [ ! -f "$SHARED_COMPOSE_FILE" ]; then
        log_error "Shared compose file not found: $SHARED_COMPOSE_FILE"
        return 1
    fi

    docker compose -f "$SHARED_COMPOSE_FILE" down "$@"
    local exit_code=$?

    if [ $exit_code -eq 0 ]; then
        log_success "Shared tier services stopped"
    else
        log_error "Failed to stop shared tier services"
    fi
    return $exit_code
}

##
# Show shared tier service status
##
shared_status() {
    echo "=== Shared Tier Status ==="
    echo ""

    if [ ! -f "$SHARED_COMPOSE_FILE" ]; then
        echo "  Compose file: Not found"
        echo "  Status: Not deployed"
        echo ""
        echo "  Deploy with: ./dive hub deploy"
        return 0
    fi

    echo "  Compose file: $SHARED_COMPOSE_FILE"
    echo ""

    # List containers with status
    local containers
    containers=$(docker compose -f "$SHARED_COMPOSE_FILE" ps --format '{{.Name}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null)

    if [ -z "$containers" ]; then
        echo "  Status: No containers running"
        echo "  Start with: ./dive shared up"
        return 0
    fi

    printf "  %-35s %-25s %s\n" "CONTAINER" "STATUS" "PORTS"
    printf "  %-35s %-25s %s\n" "---------" "------" "-----"
    echo "$containers" | while IFS=$'\t' read -r name status ports; do
        printf "  %-35s %-25s %s\n" "$name" "$status" "$ports"
    done
    echo ""
}

##
# Show shared tier logs
##
shared_logs() {
    if [ ! -f "$SHARED_COMPOSE_FILE" ]; then
        log_error "Shared compose file not found: $SHARED_COMPOSE_FILE"
        return 1
    fi

    docker compose -f "$SHARED_COMPOSE_FILE" logs "$@"
}

##
# Run deep health checks on shared tier services
##
shared_health() {
    echo "=== Shared Tier Health ==="
    echo ""

    local healthy=0
    local total=0
    local i

    # Check each shared container
    for container in $(docker ps --filter "name=shared-" --format '{{.Names}}' 2>/dev/null); do
        ((total++)) || true
        local health
        health=$(docker inspect "$container" --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' 2>/dev/null | tr -d '[:space:]')
        health="${health:-no-healthcheck}"
        local state
        state=$(docker inspect "$container" --format='{{.State.Status}}' 2>/dev/null || echo "unknown")

        local status_icon="?"
        if [ "$health" = "healthy" ]; then
            status_icon="OK"
            ((healthy++)) || true
        elif [ "$health" = "no-healthcheck" ] && [ "$state" = "running" ]; then
            status_icon="OK"
            ((healthy++)) || true
        elif [ "$state" = "running" ]; then
            status_icon="WARN"
        else
            status_icon="DOWN"
        fi

        printf "  %-35s [%s] %s (%s)\n" "$container" "$status_icon" "$state" "$health"
    done

    if [ "$total" -eq 0 ]; then
        echo "  No shared tier containers found"
        echo "  Start with: ./dive shared up"
        return 1
    fi

    echo ""
    echo "  Summary: $healthy/$total healthy"

    if [ "$healthy" -eq "$total" ]; then
        return 0
    else
        return 1
    fi
}

# =============================================================================
# MODULE DISPATCH
# =============================================================================

##
# Shared tier module command dispatcher
##
module_shared() {
    local action="${1:-help}"
    shift || true

    case "$action" in
        up|start)       shared_up "$@" ;;
        down|stop)      shared_down "$@" ;;
        status)         shared_status "$@" ;;
        logs)           shared_logs "$@" ;;
        health|verify)  shared_health "$@" ;;
        help|*)
            echo "Usage: ./dive shared <command> [args]"
            echo ""
            echo "Commands:"
            echo "  up, start         Start shared tier services"
            echo "  down, stop        Stop shared tier services"
            echo "  status            Show shared tier container status"
            echo "  logs [service]    Show shared tier logs"
            echo "  health, verify    Run deep health checks"
            echo ""
            echo "Examples:"
            echo "  ./dive shared up                    Start all shared services"
            echo "  ./dive shared status                Show container status"
            echo "  ./dive shared health                Run health checks"
            echo "  ./dive shared logs token-store      Show token store logs"
            echo "  ./dive shared down                  Stop all shared services"
            ;;
    esac
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f shared_up
export -f shared_down
export -f shared_status
export -f shared_logs
export -f shared_health
export -f module_shared

log_verbose "Shared tier module loaded"
