#!/bin/bash
# =============================================================================
# DIVE V3 Multi-Instance Management Script
# =============================================================================
# Usage:
#   ./scripts/manage-instances.sh start [all|shared|usa|fra|gbr]
#   ./scripts/manage-instances.sh stop [all|shared|usa|fra|gbr]
#   ./scripts/manage-instances.sh status
#   ./scripts/manage-instances.sh logs [usa|fra|gbr] [service]
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
INSTANCES_DIR="$PROJECT_ROOT/instances"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║${NC} $1"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════════════════════╝${NC}"
}

start_stack() {
    local stack=$1
    local project_name=$2
    local compose_file=$3
    
    echo -e "${GREEN}Starting $stack stack...${NC}"
    docker-compose -p "$project_name" -f "$compose_file" up -d
    echo -e "${GREEN}✓ $stack stack started${NC}"
}

stop_stack() {
    local stack=$1
    local project_name=$2
    local compose_file=$3
    
    echo -e "${YELLOW}Stopping $stack stack...${NC}"
    docker-compose -p "$project_name" -f "$compose_file" down
    echo -e "${YELLOW}✓ $stack stack stopped${NC}"
}

case "$1" in
    start)
        case "$2" in
            all)
                print_header "Starting ALL DIVE V3 Stacks"
                start_stack "shared" "dive-v3-shared" "$INSTANCES_DIR/shared/docker-compose.yml"
                echo ""
                echo "Waiting for shared services to be healthy..."
                sleep 10
                start_stack "USA" "dive-v3-usa" "$INSTANCES_DIR/usa/docker-compose.yml"
                echo ""
                start_stack "FRA" "dive-v3-fra" "$INSTANCES_DIR/fra/docker-compose.yml"
                echo ""
                start_stack "GBR" "dive-v3-gbr" "$INSTANCES_DIR/gbr/docker-compose.yml"
                ;;
            shared)
                print_header "Starting Shared Services"
                start_stack "shared" "dive-v3-shared" "$INSTANCES_DIR/shared/docker-compose.yml"
                ;;
            usa)
                print_header "Starting USA Instance"
                start_stack "USA" "dive-v3-usa" "$INSTANCES_DIR/usa/docker-compose.yml"
                ;;
            fra)
                print_header "Starting FRA Instance"
                start_stack "FRA" "dive-v3-fra" "$INSTANCES_DIR/fra/docker-compose.yml"
                ;;
            gbr)
                print_header "Starting GBR Instance"
                start_stack "GBR" "dive-v3-gbr" "$INSTANCES_DIR/gbr/docker-compose.yml"
                ;;
            *)
                echo "Usage: $0 start [all|shared|usa|fra|gbr]"
                exit 1
                ;;
        esac
        ;;
    stop)
        case "$2" in
            all)
                print_header "Stopping ALL DIVE V3 Stacks"
                stop_stack "GBR" "dive-v3-gbr" "$INSTANCES_DIR/gbr/docker-compose.yml" || true
                stop_stack "FRA" "dive-v3-fra" "$INSTANCES_DIR/fra/docker-compose.yml" || true
                stop_stack "USA" "dive-v3-usa" "$INSTANCES_DIR/usa/docker-compose.yml" || true
                stop_stack "shared" "dive-v3-shared" "$INSTANCES_DIR/shared/docker-compose.yml" || true
                ;;
            shared)
                print_header "Stopping Shared Services"
                stop_stack "shared" "dive-v3-shared" "$INSTANCES_DIR/shared/docker-compose.yml"
                ;;
            usa)
                print_header "Stopping USA Instance"
                stop_stack "USA" "dive-v3-usa" "$INSTANCES_DIR/usa/docker-compose.yml"
                ;;
            fra)
                print_header "Stopping FRA Instance"
                stop_stack "FRA" "dive-v3-fra" "$INSTANCES_DIR/fra/docker-compose.yml"
                ;;
            gbr)
                print_header "Stopping GBR Instance"
                stop_stack "GBR" "dive-v3-gbr" "$INSTANCES_DIR/gbr/docker-compose.yml"
                ;;
            *)
                echo "Usage: $0 stop [all|shared|usa|fra|gbr]"
                exit 1
                ;;
        esac
        ;;
    status)
        print_header "DIVE V3 Instance Status"
        echo ""
        echo -e "${BLUE}=== Shared Services ===${NC}"
        docker-compose -p dive-v3-shared -f "$INSTANCES_DIR/shared/docker-compose.yml" ps 2>/dev/null || echo "Not running"
        echo ""
        echo -e "${BLUE}=== USA Instance ===${NC}"
        docker-compose -p dive-v3-usa -f "$INSTANCES_DIR/usa/docker-compose.yml" ps 2>/dev/null || echo "Not running"
        echo ""
        echo -e "${BLUE}=== FRA Instance ===${NC}"
        docker-compose -p dive-v3-fra -f "$INSTANCES_DIR/fra/docker-compose.yml" ps 2>/dev/null || echo "Not running"
        echo ""
        echo -e "${BLUE}=== GBR Instance ===${NC}"
        docker-compose -p dive-v3-gbr -f "$INSTANCES_DIR/gbr/docker-compose.yml" ps 2>/dev/null || echo "Not running"
        ;;
    logs)
        if [ -z "$2" ]; then
            echo "Usage: $0 logs [usa|fra|gbr] [service]"
            exit 1
        fi
        case "$2" in
            usa)
                docker-compose -p dive-v3-usa -f "$INSTANCES_DIR/usa/docker-compose.yml" logs -f ${3:-}
                ;;
            fra)
                docker-compose -p dive-v3-fra -f "$INSTANCES_DIR/fra/docker-compose.yml" logs -f ${3:-}
                ;;
            gbr)
                docker-compose -p dive-v3-gbr -f "$INSTANCES_DIR/gbr/docker-compose.yml" logs -f ${3:-}
                ;;
            shared)
                docker-compose -p dive-v3-shared -f "$INSTANCES_DIR/shared/docker-compose.yml" logs -f ${3:-}
                ;;
            *)
                echo "Usage: $0 logs [shared|usa|fra|gbr] [service]"
                exit 1
                ;;
        esac
        ;;
    *)
        echo "DIVE V3 Multi-Instance Management"
        echo ""
        echo "Usage:"
        echo "  $0 start [all|shared|usa|fra|gbr]  - Start instance(s)"
        echo "  $0 stop [all|shared|usa|fra|gbr]   - Stop instance(s)"
        echo "  $0 status                           - Show status of all instances"
        echo "  $0 logs [shared|usa|fra|gbr] [svc] - View logs"
        exit 1
        ;;
esac
