#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Deployment Commands Module
# =============================================================================
# Commands: deploy, reset, nuke
# =============================================================================

# shellcheck source=common.sh disable=SC1091
# Ensure common functions are loaded
if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# DEPLOYMENT COMMANDS
# =============================================================================

cmd_deploy() {
    local target="${1:-local}"

    # SAFEGUARD: Detect if user is trying to deploy a spoke with wrong syntax
    # Correct: ./dive spoke deploy <INSTANCE>
    # Wrong:   ./dive deploy spoke <INSTANCE>
    if [ "$target" = "spoke" ]; then
        local instance_code="${2:-}"
        log_error "Incorrect syntax detected!"
        echo ""
        echo -e "${RED}❌ Wrong:${NC}  ./dive deploy spoke ${instance_code}"
        echo -e "${GREEN}✅ Correct:${NC} ./dive spoke deploy ${instance_code}"
        echo ""
        echo "Spoke deployments use a different command structure."
        echo "Run: ${CYAN}./dive spoke deploy ${instance_code}${NC}"
        echo ""
        return 1
    fi

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
        log_dry "Step 4: ${DOCKER_CMD:-docker} compose down -v"
        log_dry "Step 5: ${DOCKER_CMD:-docker} volume rm postgres_data mongo_data redis_data"
        log_dry "Step 6: ${DOCKER_CMD:-docker} compose up -d"
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
        log_verbose "Skipping local cert generation for env ${ENVIRONMENT}"
    fi

    # Choose compose file based on target/pilot/local
    local COMPOSE_FILE="docker-compose.yml"
    if [ "$target" = "pilot" ]; then
        COMPOSE_FILE="docker-compose.pilot.yml"
    fi

    # Set COMPOSE_PROJECT_NAME based on target for correct container naming
    if [ "$target" = "hub" ]; then
        export COMPOSE_PROJECT_NAME="dive-hub"
    else
        export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-dive-v3}"
    fi
    log_verbose "Using COMPOSE_PROJECT_NAME=$COMPOSE_PROJECT_NAME"

    log_step "Step 4: Stopping existing containers..."
    ${DOCKER_CMD:-docker} compose -f "$COMPOSE_FILE" down -v --remove-orphans 2>/dev/null || true

    log_step "Step 5: Volumes removed via compose down -v"
    # Volumes are automatically removed by 'docker compose down -v' above

    log_step "Step 6: Starting infrastructure services..."
    ${DOCKER_CMD:-docker} compose -f "$COMPOSE_FILE" up -d

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

    # Use terraform/hub for hub deployments, terraform/pilot for others
    local tf_dir
    if [ "$target" = "hub" ]; then
        tf_dir="${DIVE_ROOT}/terraform/hub"
    else
        tf_dir="${DIVE_ROOT}/terraform/pilot"
    fi

    cd "$tf_dir" || exit 1
    [ ! -d ".terraform" ] && terraform init -upgrade
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
    if [ "$target" = "hub" ]; then
        # Use hub_seed (SSOT) for hub deployments - 5000 ZTDF resources by default
        # This includes COI key initialization, user seeding, and ZTDF resources
        local hub_seed_script="${DIVE_ROOT}/scripts/dive-modules/hub/seed.sh"
        if [ -f "$hub_seed_script" ]; then
            # shellcheck source=hub/seed.sh disable=SC1091
            source "$hub_seed_script"
            hub_seed 5000 || log_warn "Seeding may have issues (check logs)"
        else
            log_warn "Hub seed script not found at $hub_seed_script"
        fi
    else
        # Use cmd_seed for non-hub deployments (spokes use their own pipeline)
        # shellcheck source=db.sh disable=SC1091
        source "$(dirname "${BASH_SOURCE[0]}")/db.sh"
        cmd_seed 5000 "$INSTANCE" || log_warn "Seeding may have issues (check logs)"
    fi

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
    # reset/clean is an alias for deploy
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
    ${DOCKER_CMD:-docker} compose ps --format json > "${checkpoint_path}/compose-state.json" 2>/dev/null || echo "[]" > "${checkpoint_path}/compose-state.json"

    # Backup volumes - dynamically discover volumes from compose file
    local compose_file="${COMPOSE_FILE:-docker-compose.yml}"
    local project_name="${COMPOSE_PROJECT_NAME:-dive-v3}"
    local volumes
    volumes=$(docker compose -f "$compose_file" config --volumes 2>/dev/null || echo "")

    if [ -z "$volumes" ]; then
        log_warn "Could not discover volumes from compose file, skipping volume backup"
    else
        for vol in $volumes; do
            # Construct full volume name with project prefix
            local full_vol_name="${project_name}_${vol}"
            if ${DOCKER_CMD:-docker} volume inspect "$full_vol_name" >/dev/null 2>&1; then
                log_verbose "Backing up volume: ${full_vol_name}"
                ${DOCKER_CMD:-docker} run --rm \
                    -v "${full_vol_name}:/data:ro" \
                    -v "${checkpoint_path}:/backup" \
                    alpine tar czf "/backup/${full_vol_name}.tar.gz" -C /data . 2>/dev/null || true
            fi
        done
    fi

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
    ${DOCKER_CMD:-docker} compose down 2>/dev/null || true

    # Restore volumes - dynamically discover volumes from compose file
    local compose_file="${COMPOSE_FILE:-docker-compose.yml}"
    local project_name="${COMPOSE_PROJECT_NAME:-dive-v3}"
    local volumes
    volumes=$(docker compose -f "$compose_file" config --volumes 2>/dev/null || echo "")

    if [ -z "$volumes" ]; then
        log_warn "Could not discover volumes from compose file, skipping volume restore"
    else
        for vol in $volumes; do
            # Construct full volume name with project prefix
            local full_vol_name="${project_name}_${vol}"
            local backup_file="${checkpoint_path}/${full_vol_name}.tar.gz"
            if [ -f "$backup_file" ]; then
                log_verbose "Restoring volume: ${full_vol_name}"
                # Remove existing volume
                ${DOCKER_CMD:-docker} volume rm "$full_vol_name" 2>/dev/null || true
                # Create new volume
                ${DOCKER_CMD:-docker} volume create "$full_vol_name" >/dev/null
                # Restore data
                ${DOCKER_CMD:-docker} run --rm \
                    -v "${full_vol_name}:/data" \
                    -v "${checkpoint_path}:/backup:ro" \
                    alpine tar xzf "/backup/${full_vol_name}.tar.gz" -C /data 2>/dev/null || true
            fi
        done
    fi

    # Restart services
    log_verbose "Starting containers..."
    # shellcheck source=core.sh disable=SC1091
    source "$(dirname "${BASH_SOURCE[0]}")/core.sh"
    cmd_up

    log_success "Rollback complete to: ${target}"
}

# =============================================================================
# NUKE COMMAND (sourced from deploy-nuke.sh)
# =============================================================================
source "$(dirname "${BASH_SOURCE[0]}")/deploy-nuke.sh"

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
    echo "  nuke [target]       Destroy resources (surgical: hub, spoke <CODE>, or all)"
    echo "  rollback [name]     Restore from checkpoint"
    echo "  checkpoint create   Create deployment checkpoint"
    echo "  checkpoint list     List available checkpoints"
    echo ""
    echo -e "${BOLD}Nuke Targets (surgical — only the chosen target is removed):${NC}"
    echo "  hub                 Nuke Hub only (docker-compose.hub.yml + hub TF state)"
    echo "  spoke <CODE>        Nuke one spoke (e.g. spoke FRA)"
    echo "  all                 Nuke everything (hub + all spokes + system prune)"
    echo ""
    echo -e "${BOLD}Nuke Options:${NC}"
    echo "  --confirm, --yes    Skip confirmation prompt"
    echo "  --force, -f         Force destruction (skip confirmation)"
    echo "  --keep-images       Don't remove Docker images"
    echo "  --reset-spokes      Clear spoke registration data (with spoke: that spoke; with all: all)"
    echo "  --deep              Deep clean mode:"
    echo "                        • For 'all': Remove ALL unused images + dangling volumes + TF caches"
    echo "                        • For 'spoke': Remove Terraform workspace + force-stop port-using containers"
    echo ""
    echo -e "${BOLD}Examples:${NC}"
    echo "  ./dive nuke hub --confirm                    # Nuke Hub only (spokes untouched)"
    echo "  ./dive nuke spoke FRA --confirm              # Nuke FRA spoke only (standard clean)"
    echo "  ./dive nuke spoke FRA --confirm --deep       # Nuke FRA spoke (deep: remove workspace, force ports)"
    echo "  ./dive nuke all --confirm                    # Nuke everything"
    echo "  ./dive nuke all --confirm --deep             # Full clean including base images"
    echo "  ./dive nuke hub --confirm --keep-images      # Fast hub reset (keeps images)"
    echo "  ./dive checkpoint create                    # Save current state"
    echo "  ./dive rollback                              # Restore from latest checkpoint"
    echo ""
    echo -e "${BOLD}Terraform State (scoped):${NC}"
    echo "  Nuke hub / spoke only cleans that target's Terraform state. Nuke all cleans hub + spoke + pilot."
    echo ""
}
