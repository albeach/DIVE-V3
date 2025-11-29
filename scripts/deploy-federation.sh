#!/usr/local/bin/bash
# ============================================================================
# DIVE V3 - Unified Federation Deployment Orchestrator
# ============================================================================
# Single entry point for deploying, updating, and validating the entire
# DIVE V3 federation infrastructure across all instances (USA, FRA, GBR, DEU).
#
# USAGE:
#   ./scripts/deploy-federation.sh [command] [options]
#
# COMMANDS:
#   deploy      Full deployment (generate → start → terraform → sync → validate)
#   update      Update existing deployment (generate → apply changes → sync)
#   validate    Validate current state without making changes
#   sync        Only sync federation secrets
#   remote      Deploy/update remote instance (DEU)
#   status      Show current status of all instances
#   rollback    Rollback to previous configuration (requires backup)
#
# OPTIONS:
#   --instance=CODE   Target specific instance (usa, fra, gbr, deu)
#   --skip-terraform  Skip Terraform apply step
#   --skip-remote     Skip remote deployment step
#   --skip-validate   Skip validation step
#   --dry-run         Show what would be done without making changes
#   --force           Force operation even if validation fails
#   --backup          Create backup before changes
#   --verbose         Show detailed output
#
# EXAMPLES:
#   ./scripts/deploy-federation.sh deploy              # Full deployment
#   ./scripts/deploy-federation.sh update              # Update all instances
#   ./scripts/deploy-federation.sh sync                # Only sync secrets
#   ./scripts/deploy-federation.sh remote              # Deploy DEU only
#   ./scripts/deploy-federation.sh validate            # Check everything
#   ./scripts/deploy-federation.sh status              # Show status
#
# ============================================================================

set -euo pipefail

# Script metadata
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
REGISTRY_FILE="$PROJECT_ROOT/config/federation-registry.json"
LOG_FILE="$PROJECT_ROOT/logs/deploy-$(date +%Y%m%d-%H%M%S).log"
BACKUP_DIR="$PROJECT_ROOT/backups/$(date +%Y%m%d-%H%M%S)"

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

# Colors and formatting
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m'

# Default options
COMMAND=""
INSTANCE_FILTER=""
SKIP_TERRAFORM=false
SKIP_REMOTE=false
SKIP_VALIDATE=false
DRY_RUN=false
FORCE=false
CREATE_BACKUP=false
VERBOSE=false

# Timestamps
START_TIME=$(date +%s)

# ============================================================================
# Logging Functions
# ============================================================================

log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    # Write to log file
    echo "[$timestamp] [$level] $message" >> "$LOG_FILE"
    
    # Write to stdout with colors
    case "$level" in
        INFO)    echo -e "${BLUE}[INFO]${NC} $message" ;;
        SUCCESS) echo -e "${GREEN}[OK]${NC} $message" ;;
        WARN)    echo -e "${YELLOW}[WARN]${NC} $message" ;;
        ERROR)   echo -e "${RED}[ERROR]${NC} $message" ;;
        DEBUG)   [ "$VERBOSE" = true ] && echo -e "${MAGENTA}[DEBUG]${NC} $message" ;;
        STEP)    echo -e "\n${CYAN}${BOLD}═══ $message ═══${NC}\n" ;;
    esac
}

log_info() { log INFO "$@"; }
log_success() { log SUCCESS "$@"; }
log_warn() { log WARN "$@"; }
log_error() { log ERROR "$@"; }
log_debug() { log DEBUG "$@"; }
log_step() { log STEP "$@"; }

# ============================================================================
# Utility Functions
# ============================================================================

show_banner() {
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}     ${BOLD}DIVE V3 Federation Deployment Orchestrator${NC}                           ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}     Coalition Identity & Access Management Platform                       ${CYAN}║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

show_usage() {
    echo "Usage: $0 [command] [options]"
    echo ""
    echo "Commands:"
    echo "  deploy      Full deployment (generate → start → terraform → sync → validate)"
    echo "  update      Update existing deployment (generate → apply changes → sync)"
    echo "  validate    Validate current state without making changes"
    echo "  sync        Only sync federation secrets"
    echo "  remote      Deploy/update remote instance (DEU)"
    echo "  status      Show current status of all instances"
    echo "  rollback    Rollback to previous configuration"
    echo ""
    echo "Options:"
    echo "  --instance=CODE   Target specific instance (usa, fra, gbr, deu)"
    echo "  --skip-terraform  Skip Terraform apply step"
    echo "  --skip-remote     Skip remote deployment step"
    echo "  --skip-validate   Skip validation step"
    echo "  --dry-run         Show what would be done without making changes"
    echo "  --force           Force operation even if validation fails"
    echo "  --backup          Create backup before changes"
    echo "  --verbose         Show detailed output"
    echo "  --help            Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 deploy                    # Full deployment"
    echo "  $0 update --backup           # Update with backup"
    echo "  $0 sync --instance=deu       # Sync DEU secrets only"
    echo "  $0 validate                  # Check everything"
    echo ""
}

check_prerequisites() {
    log_step "Checking Prerequisites"
    
    local missing=()
    
    # Check required tools
    command -v docker &>/dev/null || missing+=("docker")
    command -v jq &>/dev/null || missing+=("jq")
    command -v curl &>/dev/null || missing+=("curl")
    
    # Check for bash 4+ (for associative arrays)
    if [[ "${BASH_VERSION%%.*}" -lt 4 ]]; then
        log_error "Bash 4+ required. Current: $BASH_VERSION"
        log_info "On macOS, run: brew install bash"
        return 1
    fi
    
    # Check registry file
    if [ ! -f "$REGISTRY_FILE" ]; then
        missing+=("federation-registry.json")
    fi
    
    # Check SSH helper for remote operations
    if [ ! -f "$SCRIPT_DIR/remote/ssh-helper.sh" ]; then
        log_warn "SSH helper not found - remote operations may fail"
    fi
    
    if [ ${#missing[@]} -gt 0 ]; then
        log_error "Missing prerequisites: ${missing[*]}"
        return 1
    fi
    
    log_success "All prerequisites met"
    return 0
}

create_backup() {
    log_step "Creating Backup"
    
    mkdir -p "$BACKUP_DIR"
    
    # Backup configuration files
    cp -r "$PROJECT_ROOT/config" "$BACKUP_DIR/" 2>/dev/null || true
    cp -r "$PROJECT_ROOT/cloudflared" "$BACKUP_DIR/" 2>/dev/null || true
    cp "$PROJECT_ROOT/docker-compose"*.yml "$BACKUP_DIR/" 2>/dev/null || true
    
    # Backup Terraform state
    if [ -d "$PROJECT_ROOT/terraform" ]; then
        find "$PROJECT_ROOT/terraform" -name "*.tfstate*" -exec cp {} "$BACKUP_DIR/" \; 2>/dev/null || true
    fi
    
    log_success "Backup created: $BACKUP_DIR"
}

elapsed_time() {
    local end_time=$(date +%s)
    local elapsed=$((end_time - START_TIME))
    echo "$((elapsed / 60))m $((elapsed % 60))s"
}

# ============================================================================
# Core Deployment Functions
# ============================================================================

validate_config() {
    log_step "Validating Configuration"
    
    if [ -f "$SCRIPT_DIR/federation/validate-config.sh" ]; then
        if ! "$SCRIPT_DIR/federation/validate-config.sh"; then
            log_error "Configuration validation failed"
            return 1
        fi
    else
        # Basic validation
        if ! jq -e '.instances' "$REGISTRY_FILE" &>/dev/null; then
            log_error "Invalid federation-registry.json"
            return 1
        fi
        log_success "Basic configuration validation passed"
    fi
    
    return 0
}

generate_configs() {
    log_step "Generating Configurations"
    
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY RUN] Would generate configs from federation-registry.json"
        return 0
    fi
    
    if [ -f "$SCRIPT_DIR/federation/generate-all-configs.sh" ]; then
        log_info "Running generate-all-configs.sh..."
        if ! "$SCRIPT_DIR/federation/generate-all-configs.sh"; then
            log_error "Config generation failed"
            return 1
        fi
    else
        log_warn "generate-all-configs.sh not found, skipping config generation"
    fi
    
    log_success "Configurations generated"
    return 0
}

start_local_services() {
    log_step "Starting Local Services"
    
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY RUN] Would start Docker services"
        return 0
    fi
    
    cd "$PROJECT_ROOT"
    
    # Determine which instances to start
    local instances=("" "fra" "gbr")  # Empty string = main docker-compose.yml (USA)
    
    if [ -n "$INSTANCE_FILTER" ] && [ "$INSTANCE_FILTER" != "deu" ]; then
        case "$INSTANCE_FILTER" in
            usa) instances=("") ;;
            fra) instances=("fra") ;;
            gbr) instances=("gbr") ;;
        esac
    fi
    
    for inst in "${instances[@]}"; do
        local compose_file="docker-compose.yml"
        local name="USA"
        
        if [ -n "$inst" ]; then
            compose_file="docker-compose.${inst}.yml"
            name=$(echo "$inst" | tr '[:lower:]' '[:upper:]')
        fi
        
        if [ -f "$compose_file" ]; then
            log_info "Starting $name services..."
            docker compose -f "$compose_file" up -d 2>&1 | while read -r line; do
                log_debug "$line"
            done
            log_success "$name services started"
        fi
    done
    
    # Wait for Keycloak to be healthy
    log_info "Waiting for Keycloak instances to be healthy..."
    local max_wait=180
    local waited=0
    
    while [ $waited -lt $max_wait ]; do
        local healthy=0
        local total=0
        
        for inst in usa fra gbr; do
            total=$((total + 1))
            local container="dive-v3-keycloak"
            [ "$inst" != "usa" ] && container="dive-v3-keycloak-${inst}"
            
            if docker ps --format '{{.Names}} {{.Status}}' | grep -q "$container.*healthy"; then
                healthy=$((healthy + 1))
            fi
        done
        
        if [ $healthy -eq $total ]; then
            log_success "All local Keycloak instances healthy"
            break
        fi
        
        sleep 10
        waited=$((waited + 10))
        log_debug "Waiting... ($healthy/$total healthy, ${waited}s elapsed)"
    done
    
    if [ $waited -ge $max_wait ]; then
        log_warn "Timeout waiting for Keycloak - some instances may still be starting"
    fi
    
    return 0
}

apply_terraform() {
    log_step "Applying Terraform Configuration"
    
    if [ "$SKIP_TERRAFORM" = true ]; then
        log_info "Skipping Terraform (--skip-terraform)"
        return 0
    fi
    
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY RUN] Would apply Terraform configuration"
        return 0
    fi
    
    if [ -f "$SCRIPT_DIR/federation/apply-all.sh" ]; then
        log_info "Running apply-all.sh..."
        if ! "$SCRIPT_DIR/federation/apply-all.sh"; then
            log_error "Terraform apply failed"
            return 1
        fi
    else
        log_warn "apply-all.sh not found, skipping Terraform"
    fi
    
    log_success "Terraform applied successfully"
    return 0
}

sync_secrets() {
    log_step "Synchronizing Federation Secrets"
    
    local sync_args=()
    [ "$DRY_RUN" = true ] && sync_args+=("--dry-run")
    [ -n "$INSTANCE_FILTER" ] && sync_args+=("--instance=$INSTANCE_FILTER")
    
    if [ -f "$SCRIPT_DIR/sync-federation-secrets.sh" ]; then
        log_info "Running sync-federation-secrets.sh..."
        if ! /usr/local/bin/bash "$SCRIPT_DIR/sync-federation-secrets.sh" "${sync_args[@]}"; then
            log_warn "Some secrets may not have synced correctly"
            [ "$FORCE" = false ] && return 1
        fi
    else
        log_error "sync-federation-secrets.sh not found"
        return 1
    fi
    
    log_success "Federation secrets synchronized"
    return 0
}

deploy_remote() {
    log_step "Deploying Remote Instance (DEU)"
    
    if [ "$SKIP_REMOTE" = true ]; then
        log_info "Skipping remote deployment (--skip-remote)"
        return 0
    fi
    
    # Check if DEU is in scope
    if [ -n "$INSTANCE_FILTER" ] && [ "$INSTANCE_FILTER" != "deu" ]; then
        log_info "Skipping DEU (filtered to $INSTANCE_FILTER)"
        return 0
    fi
    
    # Source SSH helper
    if [ ! -f "$SCRIPT_DIR/remote/ssh-helper.sh" ]; then
        log_error "SSH helper not found"
        return 1
    fi
    
    source "$SCRIPT_DIR/remote/ssh-helper.sh"
    
    if ! check_ssh_prereqs; then
        log_error "SSH prerequisites not met"
        return 1
    fi
    
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY RUN] Would deploy to remote DEU instance"
        return 0
    fi
    
    # Test connectivity
    log_info "Testing connectivity to DEU..."
    if ! ssh_remote deu "echo 'SSH OK'" &>/dev/null; then
        log_error "Cannot connect to DEU remote server"
        return 1
    fi
    log_success "DEU connectivity confirmed"
    
    # Sync cloudflared config
    log_info "Syncing Cloudflare tunnel configuration..."
    rsync_remote deu "$PROJECT_ROOT/cloudflared/config-deu.yml" "/opt/dive-v3/cloudflared/config.yml"
    rsync_remote deu "$PROJECT_ROOT/cloudflared/deu-tunnel-credentials.json" "/opt/dive-v3/cloudflared/tunnel-credentials.json"
    
    # Sync policies
    log_info "Syncing OPA policies..."
    rsync_remote deu "$PROJECT_ROOT/policies/" "/opt/dive-v3/policies/"
    
    # Restart services
    log_info "Restarting DEU services..."
    ssh_remote deu "cd /opt/dive-v3 && docker compose down && docker compose up -d" 2>&1 | while read -r line; do
        log_debug "$line"
    done
    
    # Wait for services
    log_info "Waiting for DEU services to be healthy..."
    sleep 30
    
    local deu_status=$(ssh_remote deu "docker ps --format '{{.Names}}: {{.Status}}' | grep -c healthy" 2>/dev/null || echo "0")
    log_info "DEU healthy containers: $deu_status"
    
    log_success "Remote DEU deployment complete"
    return 0
}

validate_deployment() {
    log_step "Validating Deployment"
    
    if [ "$SKIP_VALIDATE" = true ]; then
        log_info "Skipping validation (--skip-validate)"
        return 0
    fi
    
    local failed=0
    
    # Test all endpoints
    log_info "Testing instance endpoints..."
    
    local instances=("usa:dive25.com" "fra:dive25.com" "gbr:dive25.com" "deu:prosecurity.biz")
    
    for entry in "${instances[@]}"; do
        local inst="${entry%%:*}"
        local domain="${entry##*:}"
        
        # Skip if filtered
        if [ -n "$INSTANCE_FILTER" ] && [ "$inst" != "$INSTANCE_FILTER" ]; then
            continue
        fi
        
        local idp_url="https://${inst}-idp.${domain}/realms/dive-v3-broker"
        local app_url="https://${inst}-app.${domain}"
        local api_url="https://${inst}-api.${domain}/health"
        
        local inst_upper=$(echo "$inst" | tr '[:lower:]' '[:upper:]')
        
        # Test IdP
        local idp_code=$(curl -sk -o /dev/null -w "%{http_code}" --connect-timeout 10 "$idp_url" 2>/dev/null || echo "000")
        # Test App
        local app_code=$(curl -sk -o /dev/null -w "%{http_code}" --connect-timeout 10 "$app_url" 2>/dev/null || echo "000")
        # Test API
        local api_code=$(curl -sk -o /dev/null -w "%{http_code}" --connect-timeout 10 "$api_url" 2>/dev/null || echo "000")
        
        if [ "$idp_code" = "200" ] && [ "$app_code" = "200" ] && [ "$api_code" = "200" ]; then
            log_success "$inst_upper: IdP=$idp_code App=$app_code API=$api_code"
        else
            log_error "$inst_upper: IdP=$idp_code App=$app_code API=$api_code"
            failed=$((failed + 1))
        fi
    done
    
    # Validate secrets
    log_info "Validating federation secrets..."
    if [ -f "$SCRIPT_DIR/sync-federation-secrets.sh" ]; then
        /usr/local/bin/bash "$SCRIPT_DIR/sync-federation-secrets.sh" --validate-only 2>&1 | while read -r line; do
            log_debug "$line"
        done
    fi
    
    if [ $failed -gt 0 ]; then
        log_error "Validation failed: $failed instance(s) have issues"
        [ "$FORCE" = false ] && return 1
    else
        log_success "All validations passed"
    fi
    
    return 0
}

show_status() {
    log_step "Federation Status"
    
    echo ""
    echo -e "${BOLD}Instance Status:${NC}"
    echo "────────────────────────────────────────────────────────────────"
    printf "%-8s %-25s %-8s %-8s %-8s\n" "INST" "DOMAIN" "IdP" "App" "API"
    echo "────────────────────────────────────────────────────────────────"
    
    local instances=("usa:dive25.com" "fra:dive25.com" "gbr:dive25.com" "deu:prosecurity.biz")
    
    for entry in "${instances[@]}"; do
        local inst="${entry%%:*}"
        local domain="${entry##*:}"
        
        local idp_url="https://${inst}-idp.${domain}/realms/dive-v3-broker"
        local app_url="https://${inst}-app.${domain}"
        local api_url="https://${inst}-api.${domain}/health"
        
        local inst_upper=$(echo "$inst" | tr '[:lower:]' '[:upper:]')
        
        local idp_code=$(curl -sk -o /dev/null -w "%{http_code}" --connect-timeout 5 "$idp_url" 2>/dev/null || echo "---")
        local app_code=$(curl -sk -o /dev/null -w "%{http_code}" --connect-timeout 5 "$app_url" 2>/dev/null || echo "---")
        local api_code=$(curl -sk -o /dev/null -w "%{http_code}" --connect-timeout 5 "$api_url" 2>/dev/null || echo "---")
        
        # Color codes based on status
        local idp_status="${RED}$idp_code${NC}"
        local app_status="${RED}$app_code${NC}"
        local api_status="${RED}$api_code${NC}"
        
        [ "$idp_code" = "200" ] && idp_status="${GREEN}$idp_code${NC}"
        [ "$app_code" = "200" ] && app_status="${GREEN}$app_code${NC}"
        [ "$api_code" = "200" ] && api_status="${GREEN}$api_code${NC}"
        
        printf "%-8s %-25s " "$inst_upper" "${inst}-*.${domain}"
        echo -e "$idp_status     $app_status     $api_status"
    done
    
    echo "────────────────────────────────────────────────────────────────"
    echo ""
    
    # Show Docker status
    echo -e "${BOLD}Local Docker Containers:${NC}"
    docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -E "dive-v3|NAMES" | head -15
    echo ""
    
    # Show remote status if available
    if [ -f "$SCRIPT_DIR/remote/ssh-helper.sh" ]; then
        source "$SCRIPT_DIR/remote/ssh-helper.sh" 2>/dev/null || true
        if type ssh_remote &>/dev/null && check_ssh_prereqs 2>/dev/null; then
            echo -e "${BOLD}Remote DEU Containers:${NC}"
            ssh_remote deu "docker ps --format 'table {{.Names}}\t{{.Status}}'" 2>/dev/null | head -12 || echo "  (Unable to connect)"
            echo ""
        fi
    fi
}

# ============================================================================
# Main Command Handlers
# ============================================================================

cmd_deploy() {
    log_info "Starting full deployment..."
    
    [ "$CREATE_BACKUP" = true ] && create_backup
    
    validate_config || return 1
    generate_configs || return 1
    start_local_services || return 1
    apply_terraform || return 1
    sync_secrets || return 1
    deploy_remote || return 1
    sync_secrets || return 1  # Sync again after remote is up
    validate_deployment || return 1
    
    log_step "Deployment Complete"
    log_success "Full deployment completed in $(elapsed_time)"
    show_status
}

cmd_update() {
    log_info "Starting update..."
    
    [ "$CREATE_BACKUP" = true ] && create_backup
    
    validate_config || return 1
    generate_configs || return 1
    apply_terraform || return 1
    sync_secrets || return 1
    
    if [ "$SKIP_REMOTE" = false ]; then
        deploy_remote || return 1
        sync_secrets || return 1
    fi
    
    validate_deployment || return 1
    
    log_step "Update Complete"
    log_success "Update completed in $(elapsed_time)"
}

cmd_validate() {
    log_info "Starting validation..."
    
    validate_config || return 1
    validate_deployment || return 1
    
    # Run secret validation
    if [ -f "$SCRIPT_DIR/sync-federation-secrets.sh" ]; then
        log_step "Secret Validation"
        /usr/local/bin/bash "$SCRIPT_DIR/sync-federation-secrets.sh" --validate-only
    fi
    
    log_step "Validation Complete"
    log_success "All validations passed in $(elapsed_time)"
}

cmd_sync() {
    log_info "Starting secret synchronization..."
    
    sync_secrets || return 1
    
    log_step "Sync Complete"
    log_success "Secret sync completed in $(elapsed_time)"
}

cmd_remote() {
    log_info "Starting remote deployment..."
    
    [ "$CREATE_BACKUP" = true ] && create_backup
    
    SKIP_REMOTE=false
    INSTANCE_FILTER="deu"
    
    deploy_remote || return 1
    sync_secrets || return 1
    validate_deployment || return 1
    
    log_step "Remote Deployment Complete"
    log_success "Remote deployment completed in $(elapsed_time)"
}

cmd_status() {
    show_status
}

cmd_rollback() {
    log_step "Rollback"
    
    # Find most recent backup
    local latest_backup=$(ls -td "$PROJECT_ROOT/backups"/*/ 2>/dev/null | head -1)
    
    if [ -z "$latest_backup" ]; then
        log_error "No backups found in $PROJECT_ROOT/backups/"
        return 1
    fi
    
    log_info "Latest backup: $latest_backup"
    
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY RUN] Would restore from $latest_backup"
        return 0
    fi
    
    read -p "Restore from this backup? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Rollback cancelled"
        return 0
    fi
    
    # Restore files
    cp -r "$latest_backup/config"/* "$PROJECT_ROOT/config/" 2>/dev/null || true
    cp -r "$latest_backup/cloudflared"/* "$PROJECT_ROOT/cloudflared/" 2>/dev/null || true
    cp "$latest_backup/docker-compose"*.yml "$PROJECT_ROOT/" 2>/dev/null || true
    
    log_success "Configuration restored from backup"
    log_info "You may need to restart services: docker compose restart"
}

# ============================================================================
# Main Entry Point
# ============================================================================

main() {
    # Parse arguments
    for arg in "$@"; do
        case "$arg" in
            deploy|update|validate|sync|remote|status|rollback)
                COMMAND="$arg"
                ;;
            --instance=*)
                INSTANCE_FILTER="${arg#*=}"
                ;;
            --skip-terraform)
                SKIP_TERRAFORM=true
                ;;
            --skip-remote)
                SKIP_REMOTE=true
                ;;
            --skip-validate)
                SKIP_VALIDATE=true
                ;;
            --dry-run)
                DRY_RUN=true
                ;;
            --force)
                FORCE=true
                ;;
            --backup)
                CREATE_BACKUP=true
                ;;
            --verbose)
                VERBOSE=true
                ;;
            --help|-h)
                show_usage
                exit 0
                ;;
            *)
                if [ -z "$COMMAND" ]; then
                    log_error "Unknown argument: $arg"
                    show_usage
                    exit 1
                fi
                ;;
        esac
    done
    
    # Default to status if no command
    [ -z "$COMMAND" ] && COMMAND="status"
    
    show_banner
    
    # Show configuration
    log_info "Command: $COMMAND"
    [ -n "$INSTANCE_FILTER" ] && log_info "Instance filter: $INSTANCE_FILTER"
    [ "$DRY_RUN" = true ] && log_warn "DRY RUN MODE - No changes will be made"
    [ "$FORCE" = true ] && log_warn "FORCE MODE - Will continue despite errors"
    log_info "Log file: $LOG_FILE"
    echo ""
    
    # Check prerequisites
    if [ "$COMMAND" != "status" ]; then
        check_prerequisites || exit 1
    fi
    
    # Execute command
    case "$COMMAND" in
        deploy)   cmd_deploy ;;
        update)   cmd_update ;;
        validate) cmd_validate ;;
        sync)     cmd_sync ;;
        remote)   cmd_remote ;;
        status)   cmd_status ;;
        rollback) cmd_rollback ;;
        *)
            log_error "Unknown command: $COMMAND"
            show_usage
            exit 1
            ;;
    esac
    
    local exit_code=$?
    
    if [ $exit_code -ne 0 ]; then
        log_error "Command '$COMMAND' failed with exit code $exit_code"
        log_info "Check log file for details: $LOG_FILE"
    fi
    
    exit $exit_code
}

# Run main
main "$@"
