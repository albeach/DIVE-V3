#!/bin/bash
# =============================================================================
# DIVE V3 - Master MongoDB Seeding Script
# =============================================================================
# Seeds all 4 instances (USA, FRA, GBR, DEU) with test resources.
#
# Usage:
#   ./scripts/seed-all-instances.sh [OPTIONS]
#
# Options:
#   --count N           Number of documents per instance (default: 7000)
#   --instance <code>   Seed only specific instance (usa|fra|gbr|deu|all)
#   --dry-run           Preview without seeding
#   --replace           Replace existing seeded data
#   --check-only        Only check current seed status
#   --verbose           Show detailed output
#
# Examples:
#   ./scripts/seed-all-instances.sh                      # Seed all instances with 7000 docs
#   ./scripts/seed-all-instances.sh --count 1000         # Quick test with 1000 docs
#   ./scripts/seed-all-instances.sh --instance usa       # Seed USA only
#   ./scripts/seed-all-instances.sh --check-only         # Check current status
#
# =============================================================================

set -eo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_ROOT/backend"

# Default options
COUNT=7000
INSTANCE="all"
DRY_RUN=false
REPLACE=false
CHECK_ONLY=false
VERBOSE=false

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --count)
            COUNT="$2"
            shift 2
            ;;
        --instance)
            INSTANCE=$(echo "$2" | tr '[:upper:]' '[:lower:]')
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --replace)
            REPLACE=true
            shift
            ;;
        --check-only)
            CHECK_ONLY=true
            shift
            ;;
        --verbose|-v)
            VERBOSE=true
            shift
            ;;
        --help|-h)
            head -30 "$0" | grep -E "^#" | tail -n +2 | sed 's/^# //'
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Instance configurations (instance|container|port|database)
get_instance_config() {
    local inst="$1"
    case "$inst" in
        usa) echo "USA|dive-v3-mongo|27017|dive-v3" ;;
        fra) echo "FRA|dive-v3-mongodb-fra|27018|dive-v3-fra" ;;
        gbr) echo "GBR|dive-v3-mongodb-gbr|27019|dive-v3-gbr" ;;
        deu) echo "DEU|dive-v3-mongodb-deu|27017|dive-v3-deu" ;;
        *) echo "" ;;
    esac
}

# Check MongoDB status for an instance
check_mongodb_status() {
    local inst="$1"
    local config=$(get_instance_config "$inst")
    if [[ -z "$config" ]]; then
        echo -e "  ${RED}❌ Unknown instance: $inst${NC}"
        return 1
    fi
    local container=$(echo "$config" | cut -d'|' -f2)
    local port=$(echo "$config" | cut -d'|' -f3)
    local db=$(echo "$config" | cut -d'|' -f4)
    
    # Check if container is running
    if ! docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        echo -e "  ${RED}❌ Container not running: $container${NC}"
        return 1
    fi
    
    # Check resource count
    local count=$(docker exec "$container" mongosh --quiet --eval "db.getSiblingDB('$db').resources.countDocuments()" 2>/dev/null || echo "0")
    
    # Check seed status
    local seeded=$(docker exec "$container" mongosh --quiet --eval "db.getSiblingDB('$db').resources.countDocuments({seedBatchId: {\$exists: true}})" 2>/dev/null || echo "0")
    
    echo -e "  ${GREEN}✅ $inst:${NC} $count total resources ($seeded seeded)"
    return 0
}

# Seed a single instance
seed_instance() {
    local inst="$1"
    local inst_upper=$(echo "$inst" | tr '[:lower:]' '[:upper:]')
    
    echo -e "\n${CYAN}━━━ Seeding $inst_upper ━━━${NC}\n"
    
    # Build seed command
    local cmd="npm run seed:instance -- --instance=$inst_upper --count=$COUNT"
    [[ "$DRY_RUN" == "true" ]] && cmd="$cmd --dry-run"
    [[ "$REPLACE" == "true" ]] && cmd="$cmd --replace"
    [[ "$VERBOSE" == "true" ]] && cmd="$cmd --verbose"
    
    # Load secrets for this instance
    echo -e "${BLUE}Loading secrets for $inst_upper...${NC}"
    source "$SCRIPT_DIR/sync-gcp-secrets.sh" "$inst" > /dev/null 2>&1 || {
        echo -e "${YELLOW}⚠️  Could not load GCP secrets, using environment variables${NC}"
    }
    
    # Run seed script
    cd "$BACKEND_DIR"
    echo -e "${BLUE}Running: $cmd${NC}\n"
    eval "$cmd"
    
    return $?
}

# Main execution
main() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║       DIVE V3 - MongoDB Instance Seeding                     ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    echo -e "  Instance:     ${CYAN}${INSTANCE}${NC}"
    echo -e "  Count:        ${CYAN}${COUNT}${NC} documents per instance"
    echo -e "  Dry Run:      ${DRY_RUN}"
    echo -e "  Replace:      ${REPLACE}"
    echo -e "  Check Only:   ${CHECK_ONLY}"
    echo ""
    
    # Check-only mode
    if [[ "$CHECK_ONLY" == "true" ]]; then
        echo -e "${CYAN}━━━ Current MongoDB Status ━━━${NC}\n"
        
        local all_healthy=true
        for inst in usa fra gbr deu; do
            if [[ "$INSTANCE" == "all" || "$INSTANCE" == "$inst" ]]; then
                check_mongodb_status "$inst" || all_healthy=false
            fi
        done
        
        echo ""
        if [[ "$all_healthy" == "true" ]]; then
            echo -e "${GREEN}✅ All requested instances are accessible${NC}"
        else
            echo -e "${YELLOW}⚠️  Some instances are not accessible${NC}"
        fi
        exit 0
    fi
    
    # Check prerequisites
    echo -e "${CYAN}━━━ Pre-flight Checks ━━━${NC}\n"
    
    # Check for local MongoDB conflicts
    if [[ -f "$SCRIPT_DIR/check-mongodb-conflicts.sh" ]]; then
        "$SCRIPT_DIR/check-mongodb-conflicts.sh" --auto-fix || {
            echo -e "${RED}❌ MongoDB port conflicts detected. Cannot continue.${NC}"
            exit 1
        }
    fi
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}❌ Docker not found${NC}"
        exit 1
    fi
    echo -e "  ${GREEN}✅ Docker available${NC}"
    
    # Check Node.js in backend
    if ! command -v node &> /dev/null; then
        echo -e "${RED}❌ Node.js not found${NC}"
        exit 1
    fi
    echo -e "  ${GREEN}✅ Node.js available${NC}"
    
    # Check backend dependencies
    if [[ ! -d "$BACKEND_DIR/node_modules" ]]; then
        echo -e "${YELLOW}⚠️  Backend dependencies not installed, running npm install...${NC}"
        cd "$BACKEND_DIR" && npm install
    fi
    echo -e "  ${GREEN}✅ Backend dependencies installed${NC}"
    
    # Check GCP auth (warning only)
    if ! gcloud auth print-access-token &>/dev/null 2>&1; then
        echo -e "  ${YELLOW}⚠️  GCP not authenticated (will use environment variables)${NC}"
    else
        echo -e "  ${GREEN}✅ GCP authenticated${NC}"
    fi
    
    # Show current status
    echo -e "\n${CYAN}━━━ Current MongoDB Status ━━━${NC}\n"
    for inst in usa fra gbr deu; do
        if [[ "$INSTANCE" == "all" || "$INSTANCE" == "$inst" ]]; then
            check_mongodb_status "$inst" || true
        fi
    done
    
    # Confirmation prompt (unless dry-run)
    if [[ "$DRY_RUN" == "false" ]]; then
        echo ""
        echo -e "${YELLOW}⚠️  This will seed $COUNT documents per instance.${NC}"
        [[ "$REPLACE" == "true" ]] && echo -e "${RED}⚠️  WARNING: --replace will DELETE existing seeded data!${NC}"
        echo ""
        read -p "Continue? (y/n): " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "Aborted."
            exit 0
        fi
    fi
    
    # Seed instances
    local start_time=$(date +%s)
    local success_count=0
    local fail_count=0
    
    if [[ "$INSTANCE" == "all" ]]; then
        for inst in usa fra gbr deu; do
            if seed_instance "$inst"; then
                ((success_count++))
            else
                ((fail_count++))
                echo -e "${RED}❌ Failed to seed $inst${NC}"
            fi
        done
    else
        if seed_instance "$INSTANCE"; then
            ((success_count++))
        else
            ((fail_count++))
            echo -e "${RED}❌ Failed to seed $INSTANCE${NC}"
        fi
    fi
    
    # Summary
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                     Seeding Complete                         ║"
    echo "╠══════════════════════════════════════════════════════════════╣"
    echo -e "║  ${GREEN}Successful: $success_count${NC}"
    [[ $fail_count -gt 0 ]] && echo -e "║  ${RED}Failed: $fail_count${NC}"
    echo "║  Duration: ${duration}s"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    
    # Final status check
    echo -e "${CYAN}━━━ Final MongoDB Status ━━━${NC}\n"
    for inst in usa fra gbr deu; do
        if [[ "$INSTANCE" == "all" || "$INSTANCE" == "$inst" ]]; then
            check_mongodb_status "$inst" || true
        fi
    done
    echo ""
    
    [[ $fail_count -gt 0 ]] && exit 1
    exit 0
}

main "$@"

