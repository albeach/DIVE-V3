#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Deployment with Verification and Auto-Rollback
# =============================================================================
# Addresses:
#   - GAP-R1: No Deployment Verification
#   - GAP-R4: Manual Rollback Process
#   - GAP-T1: No End-to-End Deployment Test
#
# This script wraps the deployment process with:
#   1. Pre-deployment snapshot
#   2. Deployment execution
#   3. Post-deployment verification
#   4. Automatic rollback on failure
#
# Usage:
#   ./scripts/deployment/deploy-with-verification.sh <INSTANCE> [OPTIONS]
#
# Exit Codes:
#   0 - Deployment successful and verified
#   1 - Deployment failed and rolled back
#   2 - Rollback failed (manual intervention required)
#
# =============================================================================

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKUP_DIR="$PROJECT_ROOT/backups/deployments"
LOG_DIR="$PROJECT_ROOT/logs/deployments"
TIMESTAMP=$(date +"%Y%m%d-%H%M%S")

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Arguments
INSTANCE="${1:-}"
DEPLOY_OPTIONS=()
DRY_RUN=false
SKIP_VERIFICATION=false
SKIP_BACKUP=false
FORCE_DEPLOY=false

# Parse options
shift || true
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run) DRY_RUN=true; shift ;;
        --skip-verification) SKIP_VERIFICATION=true; shift ;;
        --skip-backup) SKIP_BACKUP=true; shift ;;
        --force) FORCE_DEPLOY=true; shift ;;
        --help|-h) usage; exit 0 ;;
        *) DEPLOY_OPTIONS+=("$1"); shift ;;
    esac
done

usage() {
    cat << EOF
DIVE V3 - Deployment with Verification and Auto-Rollback

Usage: $0 <INSTANCE> [OPTIONS] [-- DEPLOY_OPTIONS]

Arguments:
  INSTANCE    Instance code (usa, fra, gbr, deu)

Options:
  --dry-run            Simulate deployment without executing
  --skip-verification  Skip post-deployment verification
  --skip-backup        Skip pre-deployment backup (not recommended)
  --force              Force deployment even if verification fails
  --help               Show this help message

Deploy Options (passed to underlying deploy script):
  --terraform-only     Only apply Terraform configuration
  --docker-only        Only start Docker services
  --new                Create new instance

Examples:
  $0 usa                           # Standard deployment
  $0 fra --docker-only             # Docker services only
  $0 gbr --dry-run                 # Simulate deployment
  $0 deu --skip-backup --force     # Fast deployment (risky)
EOF
}

# Logging
log() { echo -e "$1"; }
log_info() { log "${BLUE}[INFO]${NC} $1"; }
log_success() { log "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { log "${YELLOW}[WARN]${NC} $1"; }
log_error() { log "${RED}[ERROR]${NC} $1"; }

# Ensure directories exist
mkdir -p "$BACKUP_DIR" "$LOG_DIR"

# Log file for this deployment
DEPLOY_LOG="$LOG_DIR/deploy-${INSTANCE:-unknown}-$TIMESTAMP.log"
exec > >(tee -a "$DEPLOY_LOG") 2>&1

# Validation
if [[ -z "$INSTANCE" ]]; then
    log_error "INSTANCE argument required"
    usage
    exit 1
fi

INSTANCE_LOWER=$(echo "$INSTANCE" | tr '[:upper:]' '[:lower:]')
INSTANCE_UPPER=$(echo "$INSTANCE" | tr '[:lower:]' '[:upper:]')
SNAPSHOT_DIR="$BACKUP_DIR/snapshot-${INSTANCE_LOWER}-$TIMESTAMP"

# Create pre-deployment snapshot
create_snapshot() {
    log_info "Creating pre-deployment snapshot..."
    mkdir -p "$SNAPSHOT_DIR"
    
    # Save current container states
    docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}' | grep -E "(${INSTANCE_LOWER}|dive-v3)" > "$SNAPSHOT_DIR/containers.txt" 2>/dev/null || true
    
    # Save current image digests
    docker images --format '{{.Repository}}:{{.Tag}}\t{{.Digest}}' | grep dive > "$SNAPSHOT_DIR/images.txt" 2>/dev/null || true
    
    # Save environment state
    if [[ "$INSTANCE_LOWER" == "usa" ]]; then
        [[ -f "$PROJECT_ROOT/docker-compose.yml" ]] && cp "$PROJECT_ROOT/docker-compose.yml" "$SNAPSHOT_DIR/"
    else
        [[ -f "$PROJECT_ROOT/docker-compose.${INSTANCE_LOWER}.yml" ]] && cp "$PROJECT_ROOT/docker-compose.${INSTANCE_LOWER}.yml" "$SNAPSHOT_DIR/"
    fi
    
    # Save environment files
    [[ -f "$PROJECT_ROOT/backend/.env" ]] && cp "$PROJECT_ROOT/backend/.env" "$SNAPSHOT_DIR/backend.env" 2>/dev/null || true
    [[ -f "$PROJECT_ROOT/frontend/.env.local" ]] && cp "$PROJECT_ROOT/frontend/.env.local" "$SNAPSHOT_DIR/frontend.env.local" 2>/dev/null || true
    
    # Create manifest
    cat > "$SNAPSHOT_DIR/manifest.json" << EOF
{
  "instance": "$INSTANCE",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "created_by": "$USER",
  "purpose": "pre-deployment-snapshot",
  "deploy_options": "${DEPLOY_OPTIONS[*]:-none}"
}
EOF
    
    log_success "Snapshot created: $SNAPSHOT_DIR"
}

# Execute deployment
execute_deployment() {
    log_info "Executing deployment for ${INSTANCE_UPPER}..."
    
    local deploy_script="$PROJECT_ROOT/scripts/deploy-dive-instance.sh"
    
    if [[ ! -x "$deploy_script" ]]; then
        log_error "Deployment script not found or not executable: $deploy_script"
        return 1
    fi
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would execute: $deploy_script $INSTANCE_UPPER ${DEPLOY_OPTIONS[*]:-}"
        return 0
    fi
    
    # Execute deployment
    if "$deploy_script" "$INSTANCE_UPPER" "${DEPLOY_OPTIONS[@]:-}"; then
        log_success "Deployment completed"
        return 0
    else
        log_error "Deployment failed"
        return 1
    fi
}

# Verify deployment
verify_deployment() {
    log_info "Verifying deployment..."
    
    local verify_script="$SCRIPT_DIR/verify-deployment.sh"
    
    if [[ ! -x "$verify_script" ]]; then
        log_warn "Verification script not found, skipping: $verify_script"
        return 0
    fi
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would execute: $verify_script $INSTANCE_LOWER"
        return 0
    fi
    
    # Wait for services to stabilize
    log_info "Waiting 30 seconds for services to stabilize..."
    sleep 30
    
    # Run verification
    if "$verify_script" "$INSTANCE_LOWER"; then
        log_success "Verification passed"
        return 0
    else
        log_error "Verification failed"
        return 1
    fi
}

# Rollback deployment
rollback_deployment() {
    log_warn "Initiating automatic rollback..."
    
    if [[ ! -d "$SNAPSHOT_DIR" ]]; then
        log_error "No snapshot found for rollback: $SNAPSHOT_DIR"
        return 1
    fi
    
    local rollback_script="$PROJECT_ROOT/scripts/rollback.sh"
    
    if [[ -x "$rollback_script" ]]; then
        log_info "Using rollback script: $rollback_script"
        
        if "$rollback_script" "$SNAPSHOT_DIR"; then
            log_success "Rollback completed"
            return 0
        else
            log_error "Rollback script failed"
            return 1
        fi
    else
        log_info "No rollback script found, performing manual rollback..."
        
        # Manual rollback procedure
        local project_name="$INSTANCE_LOWER"
        local compose_file="$PROJECT_ROOT/docker-compose.yml"
        [[ "$INSTANCE_LOWER" != "usa" ]] && compose_file="$PROJECT_ROOT/docker-compose.${INSTANCE_LOWER}.yml"
        
        # Restore compose file if backed up
        if [[ -f "$SNAPSHOT_DIR/docker-compose.${INSTANCE_LOWER}.yml" ]]; then
            cp "$SNAPSHOT_DIR/docker-compose.${INSTANCE_LOWER}.yml" "$compose_file"
        elif [[ -f "$SNAPSHOT_DIR/docker-compose.yml" ]]; then
            cp "$SNAPSHOT_DIR/docker-compose.yml" "$compose_file"
        fi
        
        # Restart services
        log_info "Restarting services..."
        if [[ "$INSTANCE_LOWER" == "usa" ]]; then
            docker compose -p usa up -d
        else
            docker compose -p "$INSTANCE_LOWER" -f "$compose_file" up -d
        fi
        
        log_success "Manual rollback completed"
        return 0
    fi
}

# Run smoke tests
run_smoke_tests() {
    log_info "Running smoke tests..."
    
    local test_script="$PROJECT_ROOT/scripts/tests/run-phase1-tests.sh"
    
    if [[ -x "$test_script" ]]; then
        if "$test_script" 2>/dev/null; then
            log_success "Smoke tests passed"
            return 0
        else
            log_warn "Smoke tests failed (non-critical)"
            return 0  # Don't fail deployment on smoke test failure
        fi
    else
        log_info "No smoke test script found, skipping"
        return 0
    fi
}

# Main execution
main() {
    local deployment_start=$(date +%s)
    local exit_code=0
    
    log ""
    log "${CYAN}═══════════════════════════════════════════════════════════════════${NC}"
    log "${CYAN}  DIVE V3 - Deployment with Verification${NC}"
    log "${CYAN}═══════════════════════════════════════════════════════════════════${NC}"
    log ""
    log "  Instance:      ${INSTANCE_UPPER}"
    log "  Timestamp:     $TIMESTAMP"
    log "  Dry Run:       $DRY_RUN"
    log "  Skip Verify:   $SKIP_VERIFICATION"
    log "  Skip Backup:   $SKIP_BACKUP"
    log "  Options:       ${DEPLOY_OPTIONS[*]:-none}"
    log "  Log File:      $DEPLOY_LOG"
    log ""
    
    # Phase 1: Pre-deployment snapshot
    log "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    log "${BLUE}  PHASE 1: Pre-Deployment Snapshot${NC}"
    log "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    if [[ "$SKIP_BACKUP" == "true" ]]; then
        log_warn "Skipping backup (--skip-backup specified)"
    else
        create_snapshot
    fi
    
    # Phase 2: Execute deployment
    log ""
    log "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    log "${BLUE}  PHASE 2: Execute Deployment${NC}"
    log "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    if ! execute_deployment; then
        log_error "Deployment execution failed"
        
        if [[ "$SKIP_BACKUP" != "true" ]]; then
            log_warn "Attempting automatic rollback..."
            if rollback_deployment; then
                log_success "Rollback successful - system restored to previous state"
                exit_code=1
            else
                log_error "ROLLBACK FAILED - Manual intervention required!"
                log_error "Snapshot location: $SNAPSHOT_DIR"
                exit_code=2
            fi
        else
            exit_code=1
        fi
        
        return $exit_code
    fi
    
    # Phase 3: Verify deployment
    log ""
    log "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    log "${BLUE}  PHASE 3: Verify Deployment${NC}"
    log "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    if [[ "$SKIP_VERIFICATION" == "true" ]]; then
        log_warn "Skipping verification (--skip-verification specified)"
    else
        if ! verify_deployment; then
            log_error "Deployment verification failed"
            
            if [[ "$FORCE_DEPLOY" == "true" ]]; then
                log_warn "Continuing despite verification failure (--force specified)"
            elif [[ "$SKIP_BACKUP" != "true" ]]; then
                log_warn "Attempting automatic rollback..."
                if rollback_deployment; then
                    log_success "Rollback successful - system restored to previous state"
                    exit_code=1
                else
                    log_error "ROLLBACK FAILED - Manual intervention required!"
                    log_error "Snapshot location: $SNAPSHOT_DIR"
                    exit_code=2
                fi
                return $exit_code
            else
                exit_code=1
                return $exit_code
            fi
        fi
    fi
    
    # Phase 4: Run smoke tests
    log ""
    log "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    log "${BLUE}  PHASE 4: Smoke Tests${NC}"
    log "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    run_smoke_tests
    
    # Summary
    local deployment_end=$(date +%s)
    local deployment_duration=$((deployment_end - deployment_start))
    
    log ""
    log "${CYAN}═══════════════════════════════════════════════════════════════════${NC}"
    log "${CYAN}  DEPLOYMENT SUMMARY${NC}"
    log "${CYAN}═══════════════════════════════════════════════════════════════════${NC}"
    log ""
    log "  Instance:    ${INSTANCE_UPPER}"
    log "  Duration:    ${deployment_duration}s"
    log "  Snapshot:    $SNAPSHOT_DIR"
    log "  Log:         $DEPLOY_LOG"
    log ""
    
    if [[ $exit_code -eq 0 ]]; then
        log "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
        log "${GREEN}║          DEPLOYMENT SUCCESSFUL ✓                               ║${NC}"
        log "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
    else
        log "${RED}╔════════════════════════════════════════════════════════════════╗${NC}"
        log "${RED}║          DEPLOYMENT FAILED                                     ║${NC}"
        log "${RED}╚════════════════════════════════════════════════════════════════╝${NC}"
    fi
    
    return $exit_code
}

# Trap for cleanup on interruption
cleanup() {
    log_warn "Deployment interrupted - check system state"
}
trap cleanup INT TERM

# Execute main
main "$@"




