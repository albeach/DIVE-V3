#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Instance Resource Seeding Script
# =============================================================================
# Seeds 7,000 ZTDF-encrypted resources to a DIVE V3 instance MongoDB database.
#
# Usage:
#   ./scripts/seed-instance-resources.sh USA              # Seed USA instance
#   ./scripts/seed-instance-resources.sh FRA --count=5000 # Seed 5000 docs to FRA
#   ./scripts/seed-instance-resources.sh ALL              # Seed all instances
#   ./scripts/seed-instance-resources.sh GBR --dry-run    # Validate only
#   ./scripts/seed-instance-resources.sh DEU --replace    # Replace existing
#
# Options:
#   --count=N      Number of documents to seed (default: 7000)
#   --dry-run      Validate templates without seeding
#   --replace      Delete existing documents before seeding
#   --verbose      Show detailed progress
#   --help         Show this help message
#
# Prerequisites:
#   - MongoDB must be running and accessible
#   - Node.js 20+ with tsx installed
#   - config/federation-registry.json must exist
#
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_ROOT/backend"

# Default options
INSTANCE=""
COUNT=7000
DRY_RUN=false
REPLACE=false
VERBOSE=false

# =============================================================================
# FUNCTIONS
# =============================================================================

usage() {
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║         DIVE V3 - Instance Resource Seeding Script                ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "Usage: $0 <INSTANCE> [OPTIONS]"
    echo ""
    echo -e "${GREEN}Instance Codes:${NC}"
    echo "  USA, FRA, GBR, DEU, or ALL (to seed all instances)"
    echo ""
    echo -e "${GREEN}Options:${NC}"
    echo "  --count=N      Number of documents to seed (1-20000, default: 7000)"
    echo "  --dry-run      Validate templates and show expected distribution"
    echo "  --replace      Delete existing generated documents before seeding"
    echo "  --verbose      Show detailed progress for each batch"
    echo "  --help         Show this help message"
    echo ""
    echo -e "${GREEN}Examples:${NC}"
    echo "  $0 USA                       # Seed 7000 docs to USA"
    echo "  $0 FRA --count=5000          # Seed 5000 docs to FRA"
    echo "  $0 ALL                       # Seed all instances"
    echo "  $0 GBR --dry-run             # Validate without seeding"
    echo "  $0 DEU --replace --verbose   # Replace existing, show progress"
    echo ""
    echo -e "${YELLOW}Note: MongoDB must be running and accessible for the target instance.${NC}"
    exit 0
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed"
        exit 1
    fi
    
    # Check tsx
    if ! command -v npx &> /dev/null; then
        log_error "npm/npx is not installed"
        exit 1
    fi
    
    # Check federation registry
    if [ ! -f "$PROJECT_ROOT/config/federation-registry.json" ]; then
        log_error "Federation registry not found: config/federation-registry.json"
        exit 1
    fi
    
    # Check KAS registry
    if [ ! -f "$PROJECT_ROOT/config/kas-registry.json" ]; then
        log_error "KAS registry not found: config/kas-registry.json"
        exit 1
    fi
    
    # Check backend directory
    if [ ! -f "$BACKEND_DIR/package.json" ]; then
        log_error "Backend directory not found: $BACKEND_DIR"
        exit 1
    fi
    
    log_success "All prerequisites met"
}

wait_for_mongodb() {
    local instance=$1
    local instance_lower=$(echo "$instance" | tr '[:upper:]' '[:lower:]')
    local max_wait=60
    local waited=0
    
    # Get MongoDB port from registry
    local port
    if [ "$instance" == "USA" ]; then
        port=27017
    elif [ "$instance" == "FRA" ]; then
        port=27018
    elif [ "$instance" == "GBR" ]; then
        port=27019
    elif [ "$instance" == "DEU" ]; then
        port=27017  # DEU is on remote host
    else
        port=27017
    fi
    
    log_info "Waiting for MongoDB (port $port)..."
    
    while [ $waited -lt $max_wait ]; do
        if nc -z localhost $port 2>/dev/null; then
            log_success "MongoDB is accessible on port $port"
            return 0
        fi
        sleep 2
        waited=$((waited + 2))
        echo -n "."
    done
    
    echo ""
    log_warning "MongoDB health check timed out (port $port)"
    return 1
}

run_seeding() {
    local instance=$1
    
    log_info "Starting resource seeding for $instance..."
    
    # Build command arguments
    local args="--instance=$instance --count=$COUNT"
    
    if [ "$DRY_RUN" = true ]; then
        args="$args --dry-run"
    fi
    
    if [ "$REPLACE" = true ]; then
        args="$args --replace"
    fi
    
    if [ "$VERBOSE" = true ]; then
        args="$args --verbose"
    fi
    
    # Change to backend directory and run
    cd "$BACKEND_DIR"
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        log_info "Installing dependencies..."
        npm install --silent
    fi
    
    # Run the seeding script
    npx tsx src/scripts/seed-instance-resources.ts $args
    
    local exit_code=$?
    
    if [ $exit_code -eq 0 ]; then
        log_success "Seeding completed for $instance"
    else
        log_error "Seeding failed for $instance (exit code: $exit_code)"
        return $exit_code
    fi
    
    cd "$PROJECT_ROOT"
}

# =============================================================================
# MAIN
# =============================================================================

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --count=*)
            COUNT="${1#*=}"
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --replace)
            REPLACE=true
            shift
            ;;
        --verbose|-v)
            VERBOSE=true
            shift
            ;;
        --help|-h)
            usage
            ;;
        *)
            if [ -z "$INSTANCE" ]; then
                INSTANCE=$(echo "$1" | tr '[:lower:]' '[:upper:]')
            else
                log_error "Unknown argument: $1"
                usage
            fi
            shift
            ;;
    esac
done

# Validate instance
if [ -z "$INSTANCE" ]; then
    log_error "Instance code is required"
    echo ""
    usage
fi

# Validate count
if ! [[ "$COUNT" =~ ^[0-9]+$ ]] || [ "$COUNT" -lt 1 ] || [ "$COUNT" -gt 20000 ]; then
    log_error "Count must be between 1 and 20000"
    exit 1
fi

# Display header
echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║         DIVE V3 - Instance Resource Seeding                       ║${NC}"
echo -e "${CYAN}╠══════════════════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║  Instance:     ${GREEN}$INSTANCE${NC}"
echo -e "${CYAN}║  Count:        ${GREEN}$COUNT${NC}"
echo -e "${CYAN}║  Mode:         ${GREEN}$([ "$DRY_RUN" = true ] && echo "DRY RUN" || ([ "$REPLACE" = true ] && echo "REPLACE" || echo "APPEND"))${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check prerequisites
check_prerequisites

# Seed instance(s)
if [ "$INSTANCE" == "ALL" ]; then
    # Seed all instances
    INSTANCES=("USA" "FRA" "GBR" "DEU")
    FAILED=0
    
    for inst in "${INSTANCES[@]}"; do
        echo ""
        echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        
        if [ "$DRY_RUN" != true ]; then
            wait_for_mongodb "$inst" || log_warning "Continuing without MongoDB health check"
        fi
        
        if ! run_seeding "$inst"; then
            FAILED=$((FAILED + 1))
        fi
    done
    
    echo ""
    if [ $FAILED -eq 0 ]; then
        log_success "All instances seeded successfully!"
    else
        log_warning "$FAILED instance(s) failed to seed"
        exit 1
    fi
else
    # Seed single instance
    if [ "$DRY_RUN" != true ]; then
        wait_for_mongodb "$INSTANCE" || log_warning "Continuing without MongoDB health check"
    fi
    
    run_seeding "$INSTANCE"
fi

echo ""
log_success "Seeding script completed"
echo ""

