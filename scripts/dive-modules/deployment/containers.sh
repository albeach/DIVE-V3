#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Container Management Module (Consolidated)
# =============================================================================
# Container orchestration, compose generation, and lifecycle management
# =============================================================================
# Version: 5.0.0 (Module Consolidation)
# Date: 2026-01-22
#
# Consolidates:
#   - spoke/pipeline/spoke-containers.sh
#   - Container operations from hub/spoke modules
# =============================================================================

# Prevent multiple sourcing
[ -n "$DIVE_DEPLOYMENT_CONTAINERS_LOADED" ] && return 0
export DIVE_DEPLOYMENT_CONTAINERS_LOADED=1

# =============================================================================
# LOAD DEPENDENCIES
# =============================================================================

DEPLOYMENT_DIR="$(dirname "${BASH_SOURCE[0]}")"
MODULES_DIR="$(dirname "$DEPLOYMENT_DIR")"

if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "${MODULES_DIR}/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# CONTAINER LIFECYCLE FUNCTIONS
# =============================================================================

##
# Start containers with health wait
#
# Arguments:
#   $1 - Container prefix (e.g., dive-spoke-alb)
#   $2 - Compose file path
#   $3 - Max wait time (default: 300)
##
containers_start() {
    local container_prefix="$1"
    local compose_file="$2"
    local max_wait="${3:-300}"

    log_info "Starting containers for $container_prefix..."

    docker compose -f "$compose_file" up -d

    # Wait for containers to be healthy
    local services=$(docker compose -f "$compose_file" config --services)

    for service in $services; do
        local container="${container_prefix}-${service}"

        log_verbose "Waiting for $container to become healthy..."

        local elapsed=0
        while [ $elapsed -lt $max_wait ]; do
            local status=$(docker inspect "$container" --format='{{.State.Health.Status}}' 2>/dev/null || echo "not_found")

            case "$status" in
                "healthy")
                    log_verbose "$container is healthy"
                    break
                    ;;
                "not_found")
                    log_verbose "$container does not have health check, checking running state"
                    local running=$(docker inspect "$container" --format='{{.State.Running}}' 2>/dev/null || echo "false")
                    if [ "$running" = "true" ]; then
                        break
                    fi
                    ;;
            esac

            sleep 5
            ((elapsed += 5))
        done

        if [ $elapsed -ge $max_wait ]; then
            log_warn "Timeout waiting for $container"
        fi
    done

    log_success "Containers started for $container_prefix"
}

##
# Stop containers
#
# Arguments:
#   $1 - Compose file path
##
containers_stop() {
    local compose_file="$1"

    log_info "Stopping containers..."
    docker compose -f "$compose_file" down
    log_success "Containers stopped"
}

##
# Restart containers
#
# Arguments:
#   $1 - Compose file path
#   $2 - Optional service name
##
containers_restart() {
    local compose_file="$1"
    local service="${2:-}"

    if [ -n "$service" ]; then
        log_info "Restarting $service..."
        docker compose -f "$compose_file" restart "$service"
    else
        log_info "Restarting all containers..."
        docker compose -f "$compose_file" restart
    fi

    log_success "Restart complete"
}

##
# Get container status
#
# Arguments:
#   $1 - Container prefix
##
containers_status() {
    local container_prefix="$1"

    echo "=== Container Status: $container_prefix ==="
    echo ""

    docker ps -a --filter "name=$container_prefix" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

    echo ""
    echo "Health Status:"

    for container in $(docker ps -a --filter "name=$container_prefix" --format '{{.Names}}'); do
        local health=$(docker inspect "$container" --format='{{.State.Health.Status}}' 2>/dev/null || echo "no_healthcheck")
        printf "  %-40s %s\n" "$container" "$health"
    done
}

##
# Get container logs
#
# Arguments:
#   $1 - Container prefix or full container name
#   $2 - Tail lines (default: 100)
#   $3 - Follow (true/false)
##
containers_logs() {
    local container="$1"
    local tail="${2:-100}"
    local follow="${3:-false}"

    local follow_flag=""
    [ "$follow" = "true" ] && follow_flag="-f"

    docker logs $follow_flag --tail "$tail" "$container"
}

##
# Execute command in container
#
# Arguments:
#   $1 - Container name
#   $@ - Command to execute
##
containers_exec() {
    local container="$1"
    shift

    docker exec -it "$container" "$@"
}

# =============================================================================
# CONTAINER HEALTH FUNCTIONS
# =============================================================================

##
# Check if container is healthy
#
# Arguments:
#   $1 - Container name
#
# Returns:
#   0 - Healthy
#   1 - Not healthy
##
container_is_healthy() {
    local container="$1"

    local health=$(docker inspect "$container" --format='{{.State.Health.Status}}' 2>/dev/null || echo "unknown")

    [ "$health" = "healthy" ]
}

##
# Wait for container to become healthy
#
# Arguments:
#   $1 - Container name
#   $2 - Max wait (default: 300)
#
# Returns:
#   0 - Became healthy
#   1 - Timeout
##
container_wait_healthy() {
    local container="$1"
    local max_wait="${2:-300}"

    local elapsed=0

    while [ $elapsed -lt $max_wait ]; do
        if container_is_healthy "$container"; then
            return 0
        fi

        sleep 5
        ((elapsed += 5))
    done

    return 1
}

##
# Restart unhealthy containers
#
# Arguments:
#   $1 - Container prefix
##
containers_restart_unhealthy() {
    local container_prefix="$1"

    log_info "Checking for unhealthy containers..."

    local restarted=0

    for container in $(docker ps --filter "name=$container_prefix" --filter "health=unhealthy" --format '{{.Names}}'); do
        log_warn "Restarting unhealthy container: $container"
        docker restart "$container"
        ((restarted++))
    done

    if [ $restarted -eq 0 ]; then
        log_info "No unhealthy containers found"
    else
        log_info "Restarted $restarted unhealthy containers"
    fi
}

# =============================================================================
# CONTAINER CLEANUP FUNCTIONS
# =============================================================================

##
# Remove stale containers
#
# Arguments:
#   $1 - Container prefix
##
containers_cleanup_stale() {
    local container_prefix="$1"

    log_info "Cleaning stale containers for $container_prefix..."

    # Remove stopped containers
    local removed=$(docker ps -a --filter "name=$container_prefix" --filter "status=exited" -q | wc -l)
    docker ps -a --filter "name=$container_prefix" --filter "status=exited" -q | grep . | xargs docker rm 2>/dev/null || true

    log_info "Removed $removed stale containers"
}

##
# Remove orphaned volumes
#
# Arguments:
#   $1 - Volume prefix
##
containers_cleanup_volumes() {
    local volume_prefix="$1"

    log_info "Cleaning orphaned volumes for $volume_prefix..."

    docker volume ls -q --filter "name=$volume_prefix" --filter "dangling=true" | grep . | xargs docker volume rm 2>/dev/null || true
}

# =============================================================================
# NETWORK FUNCTIONS
# =============================================================================

##
# Ensure network exists
#
# Arguments:
#   $1 - Network name (default: dive-shared)
##
ensure_network() {
    local network="${1:-dive-shared}"

    if ! docker network inspect "$network" >/dev/null 2>&1; then
        log_info "Creating Docker network: $network"
        docker network create "$network"
    fi
}

##
# Connect container to network
#
# Arguments:
#   $1 - Container name
#   $2 - Network name
##
container_connect_network() {
    local container="$1"
    local network="$2"

    docker network connect "$network" "$container" 2>/dev/null || true
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f containers_start
export -f containers_stop
export -f containers_restart
export -f containers_status
export -f containers_logs
export -f containers_exec
export -f container_is_healthy
export -f container_wait_healthy
export -f containers_restart_unhealthy
export -f containers_cleanup_stale
export -f containers_cleanup_volumes
export -f ensure_network
export -f container_connect_network

log_verbose "Containers module loaded"
