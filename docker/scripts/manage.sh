#!/bin/bash
# =============================================================================
# DIVE V3 - Instance Management Script
# =============================================================================
# Best practice: Single entry point for all Docker operations
#
# Usage:
#   ./manage.sh start [instance]     Start instance(s)
#   ./manage.sh stop [instance]      Stop instance(s)
#   ./manage.sh restart [instance]   Restart instance(s)
#   ./manage.sh status               Show all instances status
#   ./manage.sh logs [instance]      Show logs for instance
#   ./manage.sh clean                Remove all containers and volumes
#
# Examples:
#   ./manage.sh start                 # Start all instances
#   ./manage.sh start usa             # Start only USA
#   ./manage.sh status                # Show status
#   ./manage.sh logs fra              # Show FRA logs
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="$(dirname "$SCRIPT_DIR")"
INSTANCES_DIR="$DOCKER_DIR/instances"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Instance list
INSTANCES=("usa" "fra" "gbr")

# -----------------------------------------------------------------------------
# Helper Functions
# -----------------------------------------------------------------------------

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "  DIVE V3 - $1"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
}

# -----------------------------------------------------------------------------
# Commands
# -----------------------------------------------------------------------------

start_instance() {
    local instance=$1
    local instance_dir="$INSTANCES_DIR/$instance"

    if [[ ! -d "$instance_dir" ]]; then
        log_error "Instance '$instance' not found at $instance_dir"
        return 1
    fi

    log_info "Starting $instance instance..."
    (cd "$instance_dir" && docker compose up -d)
    log_success "$instance instance started"
}

stop_instance() {
    local instance=$1
    local instance_dir="$INSTANCES_DIR/$instance"

    if [[ ! -d "$instance_dir" ]]; then
        log_error "Instance '$instance' not found"
        return 1
    fi

    log_info "Stopping $instance instance..."
    (cd "$instance_dir" && docker compose down)
    log_success "$instance instance stopped"
}

restart_instance() {
    local instance=$1
    stop_instance "$instance"
    start_instance "$instance"
}

start_all() {
    print_header "Starting All Instances"

    # Start shared services first
    log_info "Starting shared services..."
    (cd "$INSTANCES_DIR/shared" && docker compose up -d)
    log_success "Shared services started"

    # Wait for shared network to be ready
    sleep 2

    # Start each instance
    for instance in "${INSTANCES[@]}"; do
        start_instance "$instance"
    done

    print_header "All Instances Started"
}

stop_all() {
    print_header "Stopping All Instances"

    # Stop instances first
    for instance in "${INSTANCES[@]}"; do
        stop_instance "$instance" || true
    done

    # Stop shared services last
    log_info "Stopping shared services..."
    (cd "$INSTANCES_DIR/shared" && docker compose down) || true
    log_success "Shared services stopped"

    print_header "All Instances Stopped"
}

show_status() {
    print_header "Instance Status"

    echo "Containers by Project:"
    echo ""

    docker ps -a --format '{{json .}}' | python3 -c "
import json, sys
from collections import defaultdict

projects = defaultdict(list)
for line in sys.stdin:
    try:
        c = json.loads(line)
        labels = c.get('Labels', '')
        proj = 'unknown'
        for l in labels.split(','):
            if 'com.docker.compose.project=' in l:
                proj = l.split('=')[1]
                break
        status = c['Status'][:40]
        healthy = '✅' if 'healthy' in status else '⚠️' if 'starting' in status else '❌'
        projects[proj].append((c['Names'], status, healthy))
    except:
        pass

for p in sorted(projects.keys()):
    if p.startswith('dive-v3'):
        print(f'\n{p}:')
        for name, status, health in sorted(projects[p]):
            print(f'  {health} {name}: {status}')
"
    echo ""
}

show_logs() {
    local instance=$1
    local instance_dir="$INSTANCES_DIR/$instance"

    if [[ ! -d "$instance_dir" ]]; then
        log_error "Instance '$instance' not found"
        return 1
    fi

    (cd "$instance_dir" && docker compose logs -f)
}

clean_all() {
    print_header "Cleaning All Instances"

    log_warn "This will remove ALL containers, networks, and volumes!"
    read -p "Are you sure? (y/N) " -n 1 -r
    echo

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # Stop and remove all instances
        for instance in "${INSTANCES[@]}"; do
            log_info "Cleaning $instance..."
            (cd "$INSTANCES_DIR/$instance" && docker compose down -v --remove-orphans) || true
        done

        # Clean shared
        log_info "Cleaning shared services..."
        (cd "$INSTANCES_DIR/shared" && docker compose down -v --remove-orphans) || true

        log_success "All instances cleaned"
    else
        log_info "Aborted"
    fi
}

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------

show_usage() {
    echo "Usage: $0 <command> [instance]"
    echo ""
    echo "Commands:"
    echo "  start [instance]     Start instance(s) (default: all)"
    echo "  stop [instance]      Stop instance(s) (default: all)"
    echo "  restart [instance]   Restart instance(s)"
    echo "  status               Show all instances status"
    echo "  logs <instance>      Show logs for instance"
    echo "  clean                Remove all containers and volumes"
    echo ""
    echo "Instances: usa, fra, gbr, shared"
}

main() {
    local command=${1:-"status"}
    local instance=${2:-""}

    case "$command" in
        start)
            if [[ -z "$instance" ]]; then
                start_all
            else
                start_instance "$instance"
            fi
            ;;
        stop)
            if [[ -z "$instance" ]]; then
                stop_all
            else
                stop_instance "$instance"
            fi
            ;;
        restart)
            if [[ -z "$instance" ]]; then
                stop_all
                start_all
            else
                restart_instance "$instance"
            fi
            ;;
        status)
            show_status
            ;;
        logs)
            if [[ -z "$instance" ]]; then
                log_error "Please specify an instance: usa, fra, gbr, shared"
                exit 1
            fi
            show_logs "$instance"
            ;;
        clean)
            clean_all
            ;;
        help|--help|-h)
            show_usage
            ;;
        *)
            log_error "Unknown command: $command"
            show_usage
            exit 1
            ;;
    esac
}

main "$@"

