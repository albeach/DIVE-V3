#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 CLI - Deployment Commands Module
# =============================================================================
# Commands: deploy, reset, nuke
# =============================================================================

# shellcheck source=common.sh disable=SC1091
# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# DEPLOYMENT COMMANDS
# =============================================================================

cmd_deploy() {
    local target="${1:-local}"
    # Align ENVIRONMENT with target unless explicitly set
    if [ -z "$ENVIRONMENT" ]; then
        ENVIRONMENT="$target"
    fi
    # Require explicit instance for terraform tfvars selection
    if [ -z "$INSTANCE" ]; then
        INSTANCE="usa"
    fi
    
    print_header
    echo -e "${BOLD}Full Deployment Workflow${NC}"
    echo -e "Target: ${CYAN}$target${NC}"
    echo ""
    
    local steps=(
        "1. Validate prerequisites"
        "2. Load secrets"
        "3. Generate SSL certificates (if needed)"
        "4. Stop existing containers"
        "5. Remove old volumes (clean deploy)"
        "6. Start infrastructure services"
        "7. Wait for services to be healthy"
        "8. Apply Terraform configuration"
        "9. Seed database"
        "10. Verify deployment"
    )
    
    # Show plan
    echo -e "${BOLD}Deployment Steps:${NC}"
    for step in "${steps[@]}"; do
        echo "  $step"
    done
    echo ""
    
    if [ "$DRY_RUN" = true ]; then
        echo -e "${YELLOW}DRY-RUN MODE - No changes will be made${NC}"
        echo ""
        
        log_dry "Step 1: cmd_validate"
        log_dry "Step 2: load_secrets (env=$ENVIRONMENT, instance=$INSTANCE)"
        log_dry "Step 3: check_certs"
        log_dry "Step 4: docker compose down -v"
        log_dry "Step 5: docker volume rm postgres_data mongo_data redis_data"
        log_dry "Step 6: docker compose up -d"
        log_dry "Step 7: wait 60s + health checks"
        log_dry "Step 8: terraform apply -var-file=$INSTANCE.tfvars"
        log_dry "Step 9: npm run seed:$INSTANCE"
        log_dry "Step 10: curl health endpoints"
        return 0
    fi
    
    ensure_dive_root
    cd "$DIVE_ROOT" || exit 1
    
    # Load status module for cmd_validate
    # shellcheck source=status.sh disable=SC1091
    source "$(dirname "${BASH_SOURCE[0]}")/status.sh"
    
    # Execute deployment
    log_step "Step 1: Validating prerequisites..."
    cmd_validate || { log_error "Validation failed"; return 1; }
    
    log_step "Step 2: Loading secrets..."
    load_secrets || { log_error "Failed to load secrets"; return 1; }
    # Fail fast if any critical secret is empty in non-local env
    if [[ "$ENVIRONMENT" != "local" && "$ENVIRONMENT" != "dev" ]]; then
        local missing=0
        for v in POSTGRES_PASSWORD KEYCLOAK_ADMIN_PASSWORD MONGO_PASSWORD AUTH_SECRET KEYCLOAK_CLIENT_SECRET; do
            if [ -z "${!v}" ]; then
                log_error "Missing required secret: $v"
                missing=$((missing+1))
            fi
        done
        if [ $missing -gt 0 ]; then
            return 1
        fi
    fi
    
    log_step "Step 3: Checking SSL certificates..."
    if [ "$ENVIRONMENT" = "local" ] || [ "$ENVIRONMENT" = "dev" ]; then
        check_certs || { log_error "Certificate generation failed"; return 1; }
    else
        log_verbose "Skipping mkcert for env ${ENVIRONMENT}"
    fi
    
    # Choose compose file based on target/pilot/local
    local COMPOSE_FILE="docker-compose.yml"
    if [ "$target" = "pilot" ]; then
        COMPOSE_FILE="docker-compose.pilot.yml"
    fi
    
    log_step "Step 4: Stopping existing containers..."
    docker compose -f "$COMPOSE_FILE" down -v --remove-orphans 2>/dev/null || true
    
    log_step "Step 5: Removing old volumes..."
    docker volume rm dive-v3_postgres_data dive-v3_mongo_data dive-v3_redis_data 2>/dev/null || true
    docker volume rm dive-pilot_postgres_data dive-pilot_mongo_data dive-pilot_redis_data 2>/dev/null || true
    
    log_step "Step 6: Starting infrastructure services..."
    docker compose -f "$COMPOSE_FILE" up -d
    
    log_step "Step 7: Waiting for services (90s)..."
    local wait_time=0
    while [ $wait_time -lt 90 ]; do
        sleep 10
        wait_time=$((wait_time + 10))
        echo "  ${wait_time}s elapsed..."
        
        # Check if Keycloak is ready
        if curl -kfs --max-time 3 "https://localhost:8443/health" >/dev/null 2>&1; then
            log_success "Keycloak is healthy!"
            break
        fi
    done
    
    log_step "Step 8: Applying Terraform configuration..."
    cd "${DIVE_ROOT}/terraform/pilot" || exit 1
    [ ! -d ".terraform" ] && terraform init
    # Ensure Keycloak admin credentials are available to the provider
    export KEYCLOAK_USER="${KEYCLOAK_ADMIN_USERNAME:-admin}"
    export KEYCLOAK_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD}"
    if [ -z "$KEYCLOAK_PASSWORD" ]; then
        log_error "KEYCLOAK_PASSWORD is empty; aborting terraform apply"
        return 1
    fi
    terraform apply -var-file="${target}.tfvars" -auto-approve
    cd "${DIVE_ROOT}" || exit 1
    
    log_step "Step 9: Seeding database..."
    # shellcheck source=db.sh disable=SC1091
    source "$(dirname "${BASH_SOURCE[0]}")/db.sh"
    cmd_seed "$INSTANCE" || log_warn "Seeding may have issues (check logs)"
    
    log_step "Step 10: Verifying deployment..."
    cmd_health
    
    echo ""
    log_success "Deployment complete!"
    echo ""
    echo "  Frontend: https://localhost:3000"
    echo "  Backend:  https://localhost:4000"
    echo "  Keycloak: https://localhost:8443"
    echo "  OPAL:     http://localhost:7002"
}

cmd_reset() {
    print_header
    echo -e "${RED}⚠️  RESETTING TO CLEAN STATE...${NC}"
    echo ""
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "Step 1: docker compose down -v --remove-orphans"
        log_dry "Step 2: check_certs"
        log_dry "Step 3: load_secrets"
        log_dry "Step 4: docker compose up -d"
        log_dry "Step 5: sleep 60 && terraform apply"
        return 0
    fi
    
    # Full deployment workflow
    cmd_deploy local
}

# =============================================================================
# CHECKPOINT FUNCTIONS
# =============================================================================

CHECKPOINT_DIR="${DIVE_ROOT:-.}/.dive-checkpoint"

checkpoint_create() {
    local name="${1:-$(date +%Y%m%d_%H%M%S)}"
    local checkpoint_path="${CHECKPOINT_DIR}/${name}"
    
    log_step "Creating checkpoint: ${name}"
    
    mkdir -p "${checkpoint_path}"
    
    # Save timestamp
    date -u +%Y-%m-%dT%H:%M:%SZ > "${checkpoint_path}/timestamp"
    
    # Save compose state
    docker compose ps --format json > "${checkpoint_path}/compose-state.json" 2>/dev/null || echo "[]" > "${checkpoint_path}/compose-state.json"
    
    # Backup volumes
    local volumes=("dive-v3_postgres_data" "dive-v3_mongo_data" "dive-v3_redis_data")
    for vol in "${volumes[@]}"; do
        if docker volume inspect "$vol" >/dev/null 2>&1; then
            log_verbose "Backing up volume: ${vol}"
            docker run --rm \
                -v "${vol}:/data:ro" \
                -v "${checkpoint_path}:/backup" \
                alpine tar czf "/backup/${vol}.tar.gz" -C /data . 2>/dev/null || true
        fi
    done
    
    # Save latest pointer
    echo "$name" > "${CHECKPOINT_DIR}/latest"
    
    # Prune old checkpoints (keep last 3)
    local count=0
    # shellcheck disable=SC2012
    for old_checkpoint in $(ls -t "${CHECKPOINT_DIR}" 2>/dev/null | grep -v '^latest$' | tail -n +4); do
        rm -rf "${CHECKPOINT_DIR}/${old_checkpoint}"
        count=$((count + 1))
    done
    [ $count -gt 0 ] && log_verbose "Pruned ${count} old checkpoint(s)"
    
    log_success "Checkpoint created: ${name}"
}

checkpoint_list() {
    echo -e "${BOLD}Available Checkpoints:${NC}"
    
    if [ ! -d "${CHECKPOINT_DIR}" ]; then
        echo "  No checkpoints found"
        return 0
    fi
    
    local latest=""
    [ -f "${CHECKPOINT_DIR}/latest" ] && latest=$(cat "${CHECKPOINT_DIR}/latest")
    
    for checkpoint in "${CHECKPOINT_DIR}"/*/; do
        [ ! -d "$checkpoint" ] && continue
        local name=$(basename "$checkpoint")
        local timestamp=""
        [ -f "${checkpoint}/timestamp" ] && timestamp=$(cat "${checkpoint}/timestamp")
        
        if [ "$name" = "$latest" ]; then
            echo -e "  ${GREEN}* ${name}${NC} (${timestamp}) [latest]"
        else
            echo "    ${name} (${timestamp})"
        fi
    done
}

cmd_rollback() {
    local target="${1:-}"
    
    if [ -z "$target" ]; then
        if [ -f "${CHECKPOINT_DIR}/latest" ]; then
            target=$(cat "${CHECKPOINT_DIR}/latest")
        else
            log_error "No checkpoint specified and no 'latest' checkpoint found"
            echo "Usage: ./dive rollback [checkpoint_name]"
            checkpoint_list
            return 1
        fi
    fi
    
    local checkpoint_path="${CHECKPOINT_DIR}/${target}"
    
    if [ ! -d "$checkpoint_path" ]; then
        log_error "Checkpoint not found: ${target}"
        checkpoint_list
        return 1
    fi
    
    log_step "Rolling back to checkpoint: ${target}"
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "docker compose down"
        log_dry "Restore volumes from ${checkpoint_path}"
        log_dry "docker compose up -d"
        return 0
    fi
    
    # Stop current containers
    log_verbose "Stopping containers..."
    docker compose down 2>/dev/null || true
    
    # Restore volumes
    local volumes=("dive-v3_postgres_data" "dive-v3_mongo_data" "dive-v3_redis_data")
    for vol in "${volumes[@]}"; do
        local backup_file="${checkpoint_path}/${vol}.tar.gz"
        if [ -f "$backup_file" ]; then
            log_verbose "Restoring volume: ${vol}"
            # Remove existing volume
            docker volume rm "$vol" 2>/dev/null || true
            # Create new volume
            docker volume create "$vol" >/dev/null
            # Restore data
            docker run --rm \
                -v "${vol}:/data" \
                -v "${checkpoint_path}:/backup:ro" \
                alpine tar xzf "/backup/${vol}.tar.gz" -C /data 2>/dev/null || true
        fi
    done
    
    # Restart services
    log_verbose "Starting containers..."
    # shellcheck source=core.sh disable=SC1091
    source "$(dirname "${BASH_SOURCE[0]}")/core.sh"
    cmd_up
    
    log_success "Rollback complete to: ${target}"
}

# =============================================================================
# NUKE COMMAND (FULLY IDEMPOTENT)
# =============================================================================

cmd_nuke() {
    local confirm_flag=false
    local force_flag=false
    local keep_images=false
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --confirm|--yes|-y)
                confirm_flag=true
                shift
                ;;
            --force|-f)
                force_flag=true
                confirm_flag=true
                shift
                ;;
            --keep-images)
                keep_images=true
                shift
                ;;
            *)
                shift
                ;;
        esac
    done
    
    ensure_dive_root
    cd "$DIVE_ROOT" || exit 1
    
    # Count resources to be removed
    local container_count=$(docker ps -aq --filter 'name=dive' 2>/dev/null | wc -l | tr -d ' ')
    local volume_count=$(docker volume ls -q --filter 'name=dive' 2>/dev/null | wc -l | tr -d ' ')
    local network_count=$(docker network ls -q --filter 'name=dive' 2>/dev/null | wc -l | tr -d ' ')
    
    echo ""
    echo -e "${RED}⚠️  NUKE: This will destroy ALL DIVE resources${NC}"
    echo ""
    echo "  Resources to be removed:"
    echo "    - Containers: ${container_count}"
    echo "    - Volumes:    ${volume_count}"
    echo "    - Networks:   ${network_count}"
    if [ "$keep_images" = false ]; then
        local image_count=$(docker images -q --filter 'reference=*dive*' 2>/dev/null | wc -l | tr -d ' ')
        echo "    - Images:     ${image_count}"
    fi
    echo ""
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "docker compose -f docker-compose.yml down -v --remove-orphans"
        log_dry "docker compose -f docker-compose.hub.yml down -v --remove-orphans"
        log_dry "docker compose -f docker-compose.pilot.yml down -v --remove-orphans"
        log_dry "docker volume rm (all dive-* volumes)"
        log_dry "docker network rm dive-v3-shared-network shared-network"
        [ "$keep_images" = false ] && log_dry "docker image rm (all dive images)"
        log_dry "docker system prune -f --volumes"
        log_dry "rm -rf .dive-checkpoint/"
        return 0
    fi
    
    # Require confirmation unless --confirm or --force was passed
    if [ "$confirm_flag" != true ]; then
        echo -e "${YELLOW}This action cannot be undone.${NC}"
        read -r -p "Type 'yes' to confirm destruction: " user_confirm
        if [ "$user_confirm" != "yes" ]; then
            log_info "Nuke cancelled"
            return 1
        fi
    fi
    
    log_warn "NUKING EVERYTHING..."
    
    # Stop and remove containers from all compose files
    for compose_file in docker-compose.yml docker-compose.hub.yml docker-compose.pilot.yml; do
        if [ -f "$compose_file" ]; then
            docker compose -f "$compose_file" down -v --remove-orphans 2>/dev/null || true
        fi
    done
    
    # Remove instance-specific containers
    for instance_dir in instances/*/; do
        if [ -f "${instance_dir}docker-compose.yml" ]; then
            (cd "$instance_dir" && docker compose down -v --remove-orphans 2>/dev/null) || true
        fi
    done
    
    # Remove all dive-related volumes explicitly
    for vol in $(docker volume ls -q --filter 'name=dive' 2>/dev/null); do
        docker volume rm "$vol" 2>/dev/null || true
    done
    
    # Remove dive-specific networks
    docker network rm dive-v3-shared-network 2>/dev/null || true
    docker network rm dive-v3-network 2>/dev/null || true
    docker network rm shared-network 2>/dev/null || true
    
    # Remove dive images unless --keep-images
    if [ "$keep_images" = false ]; then
        for img in $(docker images -q --filter 'reference=*dive*' 2>/dev/null); do
            docker image rm -f "$img" 2>/dev/null || true
        done
    fi
    
    # Final prune (removes any remaining dangling resources)
    docker system prune -f --volumes 2>/dev/null || true
    
    # Remove checkpoint directory
    rm -rf "${CHECKPOINT_DIR}"
    
    # Verify clean state
    local remaining_containers=$(docker ps -aq --filter 'name=dive' 2>/dev/null | wc -l | tr -d ' ')
    local remaining_volumes=$(docker volume ls -q --filter 'name=dive' 2>/dev/null | wc -l | tr -d ' ')
    local remaining_networks=$(docker network ls -q --filter 'name=dive' 2>/dev/null | wc -l | tr -d ' ')
    
    if [ "$remaining_containers" -eq 0 ] && [ "$remaining_volumes" -eq 0 ] && [ "$remaining_networks" -eq 0 ]; then
        log_success "Clean slate achieved ✓"
    else
        log_warn "Some resources may remain (containers: ${remaining_containers}, volumes: ${remaining_volumes}, networks: ${remaining_networks})"
        log_info "Run './dive nuke --confirm' again if needed"
    fi
}

# =============================================================================
# MODULE DISPATCH
# =============================================================================

module_deploy() {
    local action="${1:-deploy}"
    shift || true
    
    case "$action" in
        deploy)     cmd_deploy "$@" ;;
        reset)      cmd_reset "$@" ;;
        clean)      cmd_reset "$@" ;;
        nuke)       cmd_nuke "$@" ;;
        rollback)   cmd_rollback "$@" ;;
        checkpoint) 
            local sub="${1:-list}"
            shift || true
            case "$sub" in
                create) checkpoint_create "$@" ;;
                list)   checkpoint_list ;;
                *)      checkpoint_list ;;
            esac
            ;;
        *)          module_deploy_help ;;
    esac
}

module_deploy_help() {
    echo -e "${BOLD}Deployment Commands:${NC}"
    echo ""
    echo "  deploy              Full deployment workflow"
    echo "  reset               Reset to clean state (nuke + deploy)"
    echo "  nuke [options]      Destroy everything (containers + volumes + networks)"
    echo "  rollback [name]     Restore from checkpoint"
    echo "  checkpoint create   Create deployment checkpoint"
    echo "  checkpoint list     List available checkpoints"
    echo ""
    echo -e "${BOLD}Nuke Options:${NC}"
    echo "  --confirm, --yes    Skip confirmation prompt"
    echo "  --force, -f         Force destruction (skip confirmation)"
    echo "  --keep-images       Don't remove Docker images"
    echo ""
    echo -e "${BOLD}Examples:${NC}"
    echo "  ./dive nuke --confirm         # Destroy all DIVE resources"
    echo "  ./dive checkpoint create      # Save current state"
    echo "  ./dive rollback               # Restore from latest checkpoint"
    echo "  ./dive rollback 20251218_120000  # Restore specific checkpoint"
}
