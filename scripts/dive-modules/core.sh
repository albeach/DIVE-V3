#!/bin/bash
# =============================================================================
# DIVE V3 CLI - Core Commands Module
# =============================================================================
# Commands: up, down, restart, logs, ps, exec
# =============================================================================

# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# CORE COMMANDS
# =============================================================================

cmd_up() {
    print_header
    check_docker || exit 1
    check_certs || exit 1
    load_secrets || exit 1
    
    log_step "Starting DIVE V3 Stack..."
    
    # Choose compose file based on environment
    COMPOSE_FILE="docker-compose.yml"
    [ "$ENVIRONMENT" = "pilot" ] && COMPOSE_FILE="docker-compose.pilot.yml"
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "docker compose -f $COMPOSE_FILE up -d"
    else
        dc up -d
    fi
    
    log_success "Stack started"
    echo ""
    echo "  Frontend: https://localhost:3000"
    echo "  Backend:  https://localhost:4000"
    echo "  Keycloak: https://localhost:8443"
    echo "  OPAL:     http://localhost:7002"
}

cmd_down() {
    log_step "Stopping containers..."
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "docker compose -f docker-compose.yml down"
        log_dry "docker compose -f docker-compose.pilot.yml down"
    else
        docker compose -f docker-compose.yml down 2>/dev/null || true
        docker compose -f docker-compose.pilot.yml down 2>/dev/null || true
    fi
    
    log_success "Stack stopped"
}

cmd_restart() {
    local service="${1:-}"
    
    if [ -n "$service" ]; then
        log_step "Restarting $service..."
        run docker compose restart "$service"
    else
        cmd_down
        sleep 2
        cmd_up
    fi
}

cmd_logs() {
    local service="${1:-}"
    local lines="${2:-100}"
    
    if [ -n "$service" ]; then
        docker compose logs -f --tail="$lines" "$service"
    else
        docker compose logs -f --tail="$lines"
    fi
}

cmd_ps() {
    echo -e "${CYAN}Running DIVE Containers:${NC}"
    docker ps --filter "name=dive" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "No containers running"
}

cmd_exec() {
    local container="$1"
    shift
    local cmd="${*:-bash}"
    
    if [ -z "$container" ]; then
        echo "Usage: ./dive exec <container> [command]"
        echo "Containers: frontend, backend, keycloak, postgres, mongo, redis, opa, opal-server"
        return 1
    fi
    
    # Map short names to container names
    case "$container" in
        fe|frontend) container="dive-pilot-frontend" ;;
        be|backend)  container="dive-pilot-backend" ;;
        kc|keycloak) container="dive-pilot-keycloak" ;;
        pg|postgres) container="dive-pilot-postgres" ;;
        mongo|mongodb) container="dive-pilot-mongo" ;;
        redis)       container="dive-pilot-redis" ;;
        opa)         container="dive-pilot-opa" ;;
        opal|opal-server) container="dive-pilot-opal-server" ;;
    esac
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "docker exec -it $container $cmd"
    else
        docker exec -it "$container" $cmd
    fi
}

# =============================================================================
# MODULE DISPATCH
# =============================================================================

module_core() {
    local action="${1:-help}"
    shift || true
    
    case "$action" in
        up)      cmd_up "$@" ;;
        down)    cmd_down "$@" ;;
        restart) cmd_restart "$@" ;;
        logs)    cmd_logs "$@" ;;
        ps)      cmd_ps "$@" ;;
        exec)    cmd_exec "$@" ;;
        *)       module_core_help ;;
    esac
}

module_core_help() {
    echo -e "${BOLD}Core Commands:${NC}"
    echo "  up                  Start the stack"
    echo "  down                Stop the stack"
    echo "  restart [service]   Restart stack or specific service"
    echo "  logs [service]      View logs (follow mode)"
    echo "  ps                  List running containers"
    echo "  exec <svc> [cmd]    Execute command in container"
}



