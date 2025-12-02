#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Seed All MongoDB Databases (Local + Remote)
# =============================================================================
# Seeds 7,000 resources per instance with complete metadata evenly distributed
# across all resource attributes (classification, COI, releasability, etc.)
#
# Usage:
#   ./scripts/seed-all-instances.sh [options]
#
# Options:
#   --count N          Number of resources per instance (default: 7000)
#   --replace          Replace existing resources (default: append)
#   --dry-run          Validate without seeding
#   --instance INST    Seed specific instance only (USA|FRA|GBR|DEU)
#   --parallel         Run seeding in parallel (faster but more resource-intensive)
#
# Examples:
#   ./scripts/seed-all-instances.sh                    # Seed all with 7000 each
#   ./scripts/seed-all-instances.sh --count 10000      # Seed 10k per instance
#   ./scripts/seed-all-instances.sh --instance DEU     # Seed only DEU
#   ./scripts/seed-all-instances.sh --replace          # Replace existing data
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# Defaults
COUNT=7000
REPLACE=false
DRY_RUN=false
INSTANCE_FILTER=""
PARALLEL=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --count)
            COUNT="$2"
            shift 2
            ;;
        --replace)
            REPLACE=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --instance)
            INSTANCE_FILTER="$2"
            shift 2
            ;;
        --parallel)
            PARALLEL=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--count N] [--replace] [--dry-run] [--instance INST] [--parallel]"
            exit 1
            ;;
    esac
done

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

log_header() {
    echo -e "\n${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}\n"
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# =============================================================================
# PREREQUISITE CHECKS
# =============================================================================

check_prerequisites() {
    log_header "Checking Prerequisites"
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js not found. Please install Node.js 20+"
        exit 1
    fi
    log_success "Node.js: $(node --version)"
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        log_error "npm not found. Please install npm"
        exit 1
    fi
    log_success "npm: $(npm --version)"
    
    # Check backend directory
    if [ ! -d "backend" ]; then
        log_error "backend directory not found"
        exit 1
    fi
    log_success "Backend directory found"
    
    # Check GCP authentication (for secrets)
    if command -v gcloud &> /dev/null; then
        if gcloud auth print-access-token &>/dev/null; then
            log_success "GCP authentication: OK"
        else
            log_warn "GCP not authenticated. Run: gcloud auth login"
        fi
    else
        log_warn "gcloud CLI not found. MongoDB passwords will use environment variables"
    fi
    
    echo ""
}

# =============================================================================
# SEED SINGLE INSTANCE
# =============================================================================

seed_instance() {
    local instance="$1"
    local instance_lower=$(echo "$instance" | tr '[:upper:]' '[:lower:]')
    
    log_header "Seeding ${instance} Instance"
    
    local start_time=$(date +%s)
    local exit_code=0
    
    # Handle remote DEU instance differently
    if [[ "$instance" == "DEU" ]]; then
        log_info "Using remote seeding script for DEU instance"
        
        # Build remote seed command
        local remote_cmd="./scripts/seed-deu-remote.sh --count=${COUNT} --skip-sync"
        
        if [[ "$REPLACE" == "true" ]]; then
            remote_cmd="${remote_cmd} --replace"
        fi
        
        if [[ "$DRY_RUN" == "true" ]]; then
            remote_cmd="${remote_cmd} --dry-run"
        fi
        
        log_info "Command: ${remote_cmd}"
        echo ""
        
        if eval "$remote_cmd" 2>&1; then
            local end_time=$(date +%s)
            local duration=$((end_time - start_time))
            log_success "${instance} seeding completed in ${duration}s"
            return 0
        else
            exit_code=$?
            log_error "${instance} seeding failed (exit code: ${exit_code})"
            return $exit_code
        fi
    else
        # Local instances (USA, FRA, GBR)
        # Build command
        local cmd="cd backend && npm run seed:instance -- --instance=${instance} --count=${COUNT}"
        
        if [[ "$REPLACE" == "true" ]]; then
            cmd="${cmd} --replace"
        fi
        
        if [[ "$DRY_RUN" == "true" ]]; then
            cmd="${cmd} --dry-run"
        fi
        
        log_info "Command: ${cmd}"
        echo ""
        
        # Run seeding
        if eval "$cmd" 2>&1; then
            local end_time=$(date +%s)
            local duration=$((end_time - start_time))
            log_success "${instance} seeding completed in ${duration}s"
            return 0
        else
            exit_code=$?
            log_error "${instance} seeding failed (exit code: ${exit_code})"
            return $exit_code
        fi
    fi
}

# =============================================================================
# MAIN EXECUTION
# =============================================================================

main() {
    log_header "DIVE V3 - Seed All MongoDB Databases"
    echo "Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo ""
    echo "Configuration:"
    echo "  Resources per instance: ${COUNT}"
    echo "  Mode: $([ "$REPLACE" == "true" ] && echo "REPLACE" || echo "APPEND")"
    echo "  Dry run: $([ "$DRY_RUN" == "true" ] && echo "YES" || echo "NO")"
    echo "  Parallel: $([ "$PARALLEL" == "true" ] && echo "YES" || echo "NO")"
    echo ""
    
    # Check prerequisites
    check_prerequisites
    
    # Determine instances to seed
    local instances_to_seed=()
    if [[ -n "$INSTANCE_FILTER" ]]; then
        instances_to_seed=("$(echo "$INSTANCE_FILTER" | tr '[:lower:]' '[:upper:]')")
    else
        instances_to_seed=("USA" "FRA" "GBR" "DEU")
    fi
    
    log_header "Seeding ${#instances_to_seed[@]} Instance(s)"
    echo "Instances: ${instances_to_seed[*]}"
    echo ""
    
    # Track results
    local total_start=$(date +%s)
    local successful=0
    local failed=0
    declare -a failed_instances=()
    
    # Seed instances
    if [[ "$PARALLEL" == "true" && ${#instances_to_seed[@]} -gt 1 ]]; then
        log_info "Running seeding in parallel mode..."
        echo ""
        
        # Run in parallel (background jobs)
        local pids=()
        for instance in "${instances_to_seed[@]}"; do
            seed_instance "$instance" &
            pids+=($!)
        done
        
        # Wait for all jobs and collect results
        for i in "${!pids[@]}"; do
            local pid=${pids[$i]}
            local instance=${instances_to_seed[$i]}
            
            if wait $pid; then
                ((successful++))
            else
                ((failed++))
                failed_instances+=("$instance")
            fi
        done
    else
        # Sequential mode (safer, better for remote DEU)
        for instance in "${instances_to_seed[@]}"; do
            if seed_instance "$instance"; then
                ((successful++))
            else
                ((failed++))
                failed_instances+=("$instance")
            fi
            echo ""
        done
    fi
    
    # Summary
    local total_end=$(date +%s)
    local total_duration=$((total_end - total_start))
    
    log_header "Seeding Summary"
    echo "Total Duration: ${total_duration}s ($(($total_duration / 60))m $(($total_duration % 60))s)"
    echo ""
    echo "Results:"
    echo -e "  ${GREEN}✅ Successful: ${successful}${NC}"
    echo -e "  ${RED}❌ Failed: ${failed}${NC}"
    echo ""
    
    if [[ ${#failed_instances[@]} -gt 0 ]]; then
        echo "Failed Instances:"
        for instance in "${failed_instances[@]}"; do
            echo -e "  ${RED}❌ ${instance}${NC}"
        done
        echo ""
    fi
    
    # Calculate total resources
    local total_resources=$((successful * COUNT))
    echo "Total Resources Seeded: ${total_resources}"
    echo ""
    
    if [[ $failed -eq 0 ]]; then
        log_success "All instances seeded successfully! 🎉"
        echo ""
        echo "Next steps:"
        echo "  1. Verify resources: ./backend/check-resources.js"
        echo "  2. Test federated search across instances"
        echo "  3. Run E2E tests: ./scripts/tests/e2e-verify-terraform-logins.sh"
        exit 0
    else
        log_error "Some instances failed to seed"
        exit 1
    fi
}

# Run main function
main
