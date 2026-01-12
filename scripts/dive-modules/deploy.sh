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

    log_step "Step 5: Volumes removed via compose down -v"
    # Volumes are automatically removed by 'docker compose down -v' above

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
            if docker volume inspect "$full_vol_name" >/dev/null 2>&1; then
                log_verbose "Backing up volume: ${full_vol_name}"
                docker run --rm \
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
    docker compose down 2>/dev/null || true

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
                docker volume rm "$full_vol_name" 2>/dev/null || true
                # Create new volume
                docker volume create "$full_vol_name" >/dev/null
                # Restore data
                docker run --rm \
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
# NUKE COMMAND (FULLY IDEMPOTENT - ENHANCED FOR 100% CLEANUP)
# =============================================================================

cmd_nuke() {
    local confirm_flag=false
    local force_flag=false
    local keep_images=false
    local reset_spokes=false
    local deep_clean=false
    local target_type="all"  # New: all, hub, spoke, volumes, networks, orphans
    local target_instance=""  # New: specific spoke instance code

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
            --reset-spokes|--clear-spokes)
                reset_spokes=true
                shift
                ;;
            --deep|--deep-clean)
                deep_clean=true
                shift
                ;;
            hub)
                target_type="hub"
                shift
                ;;
            spoke)
                target_type="spoke"
                shift
                ;;
            volumes)
                target_type="volumes"
                shift
                ;;
            networks)
                target_type="networks"
                shift
                ;;
            orphans)
                target_type="orphans"
                shift
                ;;
            all)
                target_type="all"
                shift
                ;;
            *)
                # Unknown argument - might be a spoke code
                if [ "$target_type" = "spoke" ] && [ -z "$target_instance" ]; then
                    target_instance="$1"
                fi
                shift
                ;;
        esac
    done

    # Validate spoke targeting
    if [ "$target_type" = "spoke" ] && [ -z "$target_instance" ]; then
        log_error "Spoke instance required. Use: ./dive nuke spoke <CODE> --confirm"
        return 1
    fi

    # SAFETY: Require explicit confirmation for destructive operations
    if [ "$confirm_flag" != true ]; then
        log_error "NUKE requires explicit confirmation. Use --confirm or --yes"
        echo ""
        echo "  Safe usage:"
        echo "    ./dive nuke hub --confirm           # Nuke Hub only"
        echo "    ./dive nuke spoke ALB --confirm     # Nuke specific spoke"
        echo "    ./dive nuke all --confirm           # Nuke everything"
        echo ""
        return 1
    fi

    ensure_dive_root
    cd "$DIVE_ROOT" || exit 1

    # Load naming utilities for precise targeting
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/naming.sh" ]; then
        # shellcheck source=naming.sh disable=SC1091
        source "${DIVE_ROOT}/scripts/dive-modules/naming.sh"
    fi

    # =========================================================================
    # TARGETED RESOURCE DISCOVERY
    # =========================================================================

    local container_patterns=""
    local volume_patterns=""
    local network_patterns=""
    local scope_description=""

    case "$target_type" in
        hub)
            container_patterns="dive-hub-"
            volume_patterns="^dive-hub_"
            network_patterns="^dive-hub_"
            scope_description="Hub resources only"
            ;;
        spoke)
            local instance_lower=$(echo "$target_instance" | tr '[:upper:]' '[:lower:]')
            container_patterns="dive-spoke-${instance_lower}-"
            volume_patterns="^dive-spoke-${instance_lower}_"
            network_patterns="^dive-spoke-${instance_lower}_"
            scope_description="Spoke ${target_instance^^} resources only"
            ;;
        volumes)
            volume_patterns="^dive"
            scope_description="All DIVE volumes only"
            ;;
        networks)
            network_patterns="^dive"
            scope_description="All DIVE networks only"
            ;;
        orphans)
            scope_description="Orphaned resources only (dangling volumes, stopped containers)"
            ;;
        all)
            container_patterns="dive|spoke|hub"
            volume_patterns="^dive|^hub_|^[a-z]{3}_"
            network_patterns="dive|hub-|internal|shared-services"
            scope_description="ALL DIVE resources (hub + all spokes)"
            ;;
    esac

    # Discover containers
    local dive_containers=""
    local container_count=0
    if [ -n "$container_patterns" ] || [ "$target_type" = "orphans" ]; then
        local all_containers=$(docker ps -aq 2>/dev/null)
        for c in $all_containers; do
            local name=$(docker inspect --format '{{.Name}}' "$c" 2>/dev/null | sed 's/^\///')
            if [ "$target_type" = "orphans" ]; then
                local status=$(docker inspect --format '{{.State.Status}}' "$c" 2>/dev/null)
                if [ "$status" != "running" ]; then
                    dive_containers="$dive_containers $c"
                fi
            elif echo "$name" | grep -qE "$container_patterns"; then
                dive_containers="$dive_containers $c"
            fi
        done
        container_count=$(echo $dive_containers | wc -w | tr -d ' ')
    fi

    # Discover volumes
    local dive_volumes=""
    local volume_count=0
    if [ -n "$volume_patterns" ] || [ "$target_type" = "volumes" ] || [ "$target_type" = "all" ] || [ "$target_type" = "orphans" ]; then
        local all_volumes=$(docker volume ls -q 2>/dev/null)
        for v in $all_volumes; do
            if [ "$target_type" = "orphans" ]; then
                # Check if dangling
                if docker volume ls -qf "dangling=true" 2>/dev/null | grep -q "^${v}$"; then
                    dive_volumes="$dive_volumes $v"
                fi
            elif [ -n "$volume_patterns" ] && echo "$v" | grep -qE "$volume_patterns"; then
                dive_volumes="$dive_volumes $v"
            fi
        done
        volume_count=$(echo $dive_volumes | wc -w | tr -d ' ')
    fi

    # Discover networks
    local dive_networks=""
    local network_count=0
    if [ -n "$network_patterns" ] || [ "$target_type" = "networks" ] || [ "$target_type" = "all" ]; then
        local all_networks=$(docker network ls --format '{{.Name}}' 2>/dev/null)
        for n in $all_networks; do
            # Skip default networks
            if [[ "$n" == "bridge" || "$n" == "host" || "$n" == "none" || "$n" == "ingress" || "$n" == "docker_gwbridge" ]]; then
                continue
            fi
            if [ -n "$network_patterns" ] && echo "$n" | grep -qE "$network_patterns"; then
                dive_networks="$dive_networks $n"
            fi
        done
        network_count=$(echo $dive_networks | wc -w | tr -d ' ')
    fi

    # Dangling volumes (for orphans type or all)
    local dangling_count=0
    if [ "$target_type" = "orphans" ] || [ "$target_type" = "all" ]; then
        dangling_count=$(docker volume ls -qf dangling=true 2>/dev/null | wc -l | tr -d ' ')
    fi

    # Images
    local image_count=0
    if [ "$keep_images" = false ] && [ "$target_type" = "all" ]; then
        image_count=$(docker images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | grep -E "dive|ghcr.io/opentdf" | wc -l | tr -d ' ')
    fi

    echo ""
    echo -e "${RED}╔══════════════════════════════════════════════════════════════════════╗${NC}"
    if [ "$target_type" = "all" ]; then
        echo -e "${RED}║  ⚠️   NUKE: COMPLETE DESTRUCTION OF ALL DIVE RESOURCES               ║${NC}"
    else
        echo -e "${RED}║  ⚠️   NUKE: TARGETED RESOURCE REMOVAL                                 ║${NC}"
    fi
    echo -e "${RED}╚══════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "  Scope: ${CYAN}${scope_description}${NC}"
    echo ""
    echo "  Resources discovered for removal:"
    [ "$container_count" -gt 0 ] && echo "    - Containers:                   ${container_count}"
    [ "$volume_count" -gt 0 ] && echo "    - Named Volumes:                ${volume_count}"
    [ "$dangling_count" -gt 0 ] && echo "    - Dangling/Anonymous Volumes:   ${dangling_count}"
    [ "$network_count" -gt 0 ] && echo "    - Networks:                     ${network_count}"
    [ "$keep_images" = false ] && [ "$image_count" -gt 0 ] && echo "    - Images:                       ${image_count}"

    if [ "$target_type" = "spoke" ] && [ "$reset_spokes" = true ]; then
        echo "    - Spoke Config:                 ${target_instance^^} registration data"
    elif [ "$reset_spokes" = true ]; then
        local spoke_count=0
        for spoke_dir in "${DIVE_ROOT}/instances"/*; do
            [ -d "$spoke_dir" ] && [ -f "$spoke_dir/config.json" ] && spoke_count=$((spoke_count + 1))
        done
        echo "    - Spoke Configs:                ${spoke_count} (all registration data will be cleared)"
    fi
    if [ "$deep_clean" = true ]; then
        echo ""
        echo -e "    ${YELLOW}--deep mode: Will also remove ALL dangling resources${NC}"
    fi
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Target: ${target_type}"
        log_dry "Phase 1: Stop compose projects"
        [ "$container_count" -gt 0 ] && log_dry "Phase 2: Force-remove ${container_count} containers"
        [ "$volume_count" -gt 0 ] && log_dry "Phase 3: Force-remove ${volume_count} named volumes"
        [ "$dangling_count" -gt 0 ] && log_dry "Phase 3b: Remove ${dangling_count} dangling volumes"
        [ "$network_count" -gt 0 ] && log_dry "Phase 4: Force-remove ${network_count} networks"
        [ "$image_count" -gt 0 ] && log_dry "Phase 5: Remove ${image_count} images"
        if [ "$target_type" = "all" ]; then
            log_dry "Phase 6: docker system prune -f --volumes"
            log_dry "Phase 7: Cleanup checkpoint directory"
        fi
        return 0
    fi

    # Require confirmation unless --confirm or --force was passed
    if [ "$confirm_flag" != true ]; then
        echo -e "${YELLOW}This action cannot be undone.${NC}"
        if [ "$target_type" = "all" ]; then
            read -r -p "Type 'yes' to confirm complete destruction: " user_confirm
        else
            read -r -p "Type 'yes' to confirm removal of ${scope_description}: " user_confirm
        fi
        if [ "$user_confirm" != "yes" ]; then
            log_info "Nuke cancelled"
            return 1
        fi
    fi

    if [ "$target_type" = "all" ]; then
        log_warn "NUKING EVERYTHING..."
    else
        log_warn "Removing ${scope_description}..."
    fi
    echo ""

    # =========================================================================
    # PHASE 2: STOP TARGETED COMPOSE PROJECTS
    # =========================================================================
    log_step "Phase 1: Stopping Docker Compose projects..."

    if [ "$target_type" = "hub" ]; then
        # Stop only hub
        if [ -f "docker-compose.hub.yml" ]; then
            log_verbose "  Stopping hub"
            docker compose -f docker-compose.hub.yml -p dive-hub down -v --remove-orphans --timeout 5 2>/dev/null || true
        fi
    elif [ "$target_type" = "spoke" ]; then
        # Stop only specific spoke
        local instance_lower=$(echo "$target_instance" | tr '[:upper:]' '[:lower:]')
        local instance_dir="instances/${instance_lower}"
        if [ -f "${instance_dir}/docker-compose.yml" ]; then
            log_verbose "  Stopping spoke: ${target_instance^^}"
            (cd "$instance_dir" && docker compose -p "dive-spoke-${instance_lower}" down -v --remove-orphans --timeout 5 2>/dev/null) || true
        fi
    elif [ "$target_type" = "all" ]; then
        # Stop all compose projects
        # Main compose files
        for compose_file in docker-compose.yml docker-compose.hub.yml docker-compose.pilot.yml docker-compose.prod.yml; do
            if [ -f "$compose_file" ]; then
                local project_name=$(grep -m 1 '^name:' "$compose_file" 2>/dev/null | sed 's/name: *//' | tr -d ' "'"'"'')
                if [ -n "$project_name" ]; then
                    log_verbose "  Stopping project: $project_name"
                    docker compose -f "$compose_file" -p "$project_name" down -v --remove-orphans --timeout 5 2>/dev/null || true
                else
                    docker compose -f "$compose_file" down -v --remove-orphans --timeout 5 2>/dev/null || true
                fi
            fi
        done

        # Instance-specific compose files (all spokes)
        for instance_dir in instances/*/; do
            if [ -f "${instance_dir}docker-compose.yml" ]; then
                log_verbose "  Stopping spoke: $(basename "$instance_dir")"
                (cd "$instance_dir" && docker compose down -v --remove-orphans --timeout 5 2>/dev/null) || true
            fi
        done
    else
        # For volumes/networks/orphans, no compose stop needed
        log_verbose "  Skipping compose stop (target_type: ${target_type})"
    fi

    # =========================================================================
    # PHASE 3: FORCE REMOVE ALL CONTAINERS
    # =========================================================================
    log_step "Phase 2/7: Force-removing all DIVE containers..."

    local removed_containers=0
    for c in $dive_containers; do
        if docker rm -f "$c" 2>/dev/null; then
            removed_containers=$((removed_containers + 1))
        fi
    done

    # Also catch any that weren't in our pattern (by compose project label)
    for label in "com.docker.compose.project=dive-hub" "com.docker.compose.project=dive-v3"; do
        for c in $(docker ps -aq --filter "label=$label" 2>/dev/null); do
            if docker rm -f "$c" 2>/dev/null; then
                removed_containers=$((removed_containers + 1))
            fi
        done
    done
    log_verbose "  Removed $removed_containers containers"

    # =========================================================================
    # PHASE 4: FORCE REMOVE ALL VOLUMES
    # =========================================================================
    log_step "Phase 3/7: Force-removing all DIVE volumes..."

    local removed_volumes=0

    # Named volumes matching our patterns
    for v in $dive_volumes; do
        if docker volume rm -f "$v" 2>/dev/null; then
            removed_volumes=$((removed_volumes + 1))
        fi
    done

    # Also remove by label
    for label in "com.docker.compose.project=dive-hub" "com.docker.compose.project=dive-v3"; do
        for v in $(docker volume ls -q --filter "label=$label" 2>/dev/null); do
            if docker volume rm -f "$v" 2>/dev/null; then
                removed_volumes=$((removed_volumes + 1))
            fi
        done
    done

    # Remove dangling/anonymous volumes (deep clean mode or always for safety)
    if [ "$deep_clean" = true ]; then
        log_verbose "  Deep clean: removing ALL dangling volumes..."
        for v in $(docker volume ls -qf dangling=true 2>/dev/null); do
            if docker volume rm -f "$v" 2>/dev/null; then
                removed_volumes=$((removed_volumes + 1))
            fi
        done
    fi
    log_verbose "  Removed $removed_volumes volumes"

    # =========================================================================
    # PHASE 5: FORCE REMOVE ALL NETWORKS
    # =========================================================================
    log_step "Phase 4/7: Force-removing all DIVE networks..."

    local removed_networks=0
    for n in $dive_networks; do
        # Disconnect all containers first
        for container in $(docker network inspect "$n" --format='{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null); do
            docker network disconnect -f "$n" "$container" 2>/dev/null || true
        done
        if docker network rm "$n" 2>/dev/null; then
            removed_networks=$((removed_networks + 1))
        fi
    done

    # Also remove by label
    for label in "com.docker.compose.project=dive-hub" "com.docker.compose.project=dive-v3"; do
        for n in $(docker network ls -q --filter "label=$label" 2>/dev/null); do
            docker network rm "$n" 2>/dev/null && removed_networks=$((removed_networks + 1))
        done
    done
    log_verbose "  Removed $removed_networks networks"

    # =========================================================================
    # PHASE 6: REMOVE IMAGES
    # =========================================================================
    if [ "$keep_images" = false ]; then
        log_step "Phase 5/7: Removing DIVE images..."
        local removed_images=0

        # Remove by name pattern (respect target_type)
        case "$target_type" in
            spoke)
                # For spoke targeting, only remove images for that spoke
                local instance_lower=$(echo "$target_instance" | tr '[:upper:]' '[:lower:]')
                for img in $(docker images --format '{{.ID}} {{.Repository}}' 2>/dev/null | grep "dive-spoke-${instance_lower}" | awk '{print $1}'); do
                    if docker image rm -f "$img" 2>/dev/null; then
                        removed_images=$((removed_images + 1))
                    fi
                done
                ;;
            hub)
                # For hub targeting, only remove hub images
                for img in $(docker images --format '{{.ID}} {{.Repository}}' 2>/dev/null | grep "dive-hub" | awk '{print $1}'); do
                    if docker image rm -f "$img" 2>/dev/null; then
                        removed_images=$((removed_images + 1))
                    fi
                done
                ;;
            all)
                # For all targeting, remove all DIVE images
                for pattern in "dive" "ghcr.io/opentdf"; do
                    for img in $(docker images --format '{{.ID}} {{.Repository}}' 2>/dev/null | grep "$pattern" | awk '{print $1}'); do
                        if docker image rm -f "$img" 2>/dev/null; then
                            removed_images=$((removed_images + 1))
                        fi
                    done
                done
                ;;
        esac

        # Remove dangling images
        docker image prune -f 2>/dev/null || true
        log_verbose "  Removed $removed_images images"
    else
        log_step "Phase 5/7: Skipping images (--keep-images)"
    fi

    # =========================================================================
    # PHASE 7: SYSTEM PRUNE
    # =========================================================================
    log_step "Phase 6/7: Final system prune..."
    docker system prune -f --volumes 2>/dev/null || true

    # =========================================================================
    # PHASE 8: CLEANUP LOCAL STATE
    # =========================================================================
    log_step "Phase 7/7: Cleaning local state..."

    # Remove checkpoint directory
    rm -rf "${CHECKPOINT_DIR}"

    # Clear spoke registrations if requested
    if [ "$reset_spokes" = true ]; then
        log_verbose "  Clearing spoke registrations..."
        if [ -f "${DIVE_ROOT}/scripts/clear-stale-spoke-registration.sh" ]; then
            bash "${DIVE_ROOT}/scripts/clear-stale-spoke-registration.sh" --all 2>/dev/null || log_warn "Could not clear spoke registrations"
        else
            for spoke_dir in "${DIVE_ROOT}/instances"/*; do
                if [ -f "$spoke_dir/config.json" ]; then
                    local instance_code=$(basename "$spoke_dir" | tr '[:lower:]' '[:upper:]')
                    if command -v jq &> /dev/null; then
                        jq 'del(.identity.registeredSpokeId) | .federation.status = "unregistered" | del(.federation.registeredAt)' \
                            "$spoke_dir/config.json" > "$spoke_dir/config.json.tmp" && \
                            mv "$spoke_dir/config.json.tmp" "$spoke_dir/config.json"
                        log_verbose "  Cleared registration for $instance_code"
                    fi
                    rm -f "$spoke_dir/.federation-registered"
                fi
            done
        fi
    fi

    # Clean Terraform state if it exists (optional for full reset)
    if [ "$deep_clean" = true ]; then
        log_verbose "  Deep clean: removing Terraform state..."
        rm -rf "${DIVE_ROOT}/terraform/pilot/.terraform" 2>/dev/null || true
        rm -f "${DIVE_ROOT}/terraform/pilot/terraform.tfstate"* 2>/dev/null || true
        rm -f "${DIVE_ROOT}/terraform/pilot/.terraform.lock.hcl" 2>/dev/null || true
    fi

    # =========================================================================
    # VERIFICATION
    # =========================================================================
    echo ""
    log_step "Verifying clean state..."

    # Recheck using same discovery logic
    local final_containers=""
    for c in $(docker ps -aq 2>/dev/null); do
        local name=$(docker inspect --format '{{.Name}}' "$c" 2>/dev/null | sed 's/^\///')
        if echo "$name" | grep -qE "$container_patterns"; then
            final_containers="$final_containers $c"
        fi
    done
    local remaining_containers=$(echo $final_containers | wc -w | tr -d ' ')

    local final_volumes=""
    for v in $(docker volume ls -q 2>/dev/null); do
        if echo "$v" | grep -qE "$volume_patterns"; then
            final_volumes="$final_volumes $v"
        fi
    done
    local remaining_volumes=$(echo $final_volumes | wc -w | tr -d ' ')

    local final_networks=""
    for n in $(docker network ls --format '{{.Name}}' 2>/dev/null); do
        if [[ "$n" == "bridge" || "$n" == "host" || "$n" == "none" || "$n" == "ingress" || "$n" == "docker_gwbridge" ]]; then
            continue
        fi
        if echo "$n" | grep -qE "$network_patterns"; then
            final_networks="$final_networks $n"
        fi
    done
    local remaining_networks=$(echo $final_networks | wc -w | tr -d ' ')

    echo ""
    if [ "$remaining_containers" -eq 0 ] && [ "$remaining_volumes" -eq 0 ] && [ "$remaining_networks" -eq 0 ]; then
        echo -e "${GREEN}╔══════════════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${GREEN}║  ✅ CLEAN SLATE ACHIEVED                                             ║${NC}"
        echo -e "${GREEN}╚══════════════════════════════════════════════════════════════════════╝${NC}"
    else
        echo -e "${YELLOW}╔══════════════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${YELLOW}║  ⚠️  PARTIAL CLEANUP - SOME RESOURCES REMAIN                         ║${NC}"
        echo -e "${YELLOW}╚══════════════════════════════════════════════════════════════════════╝${NC}"
        echo ""
        echo "  Remaining:"
        [ "$remaining_containers" -gt 0 ] && echo "    - Containers: $remaining_containers ($final_containers)"
        [ "$remaining_volumes" -gt 0 ] && echo "    - Volumes: $remaining_volumes ($final_volumes)"
        [ "$remaining_networks" -gt 0 ] && echo "    - Networks: $remaining_networks ($final_networks)"
        echo ""
        echo "  Run with --deep flag for more aggressive cleanup:"
        echo "    ./dive nuke --yes --deep"
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
    echo "  --reset-spokes      Clear spoke registration data (fixes stale spokeIds)"
    echo "  --deep              Deep clean: remove ALL dangling volumes + Terraform state"
    echo ""
    echo -e "${BOLD}Examples:${NC}"
    echo "  ./dive nuke --yes                    # Standard nuke (all DIVE resources)"
    echo "  ./dive nuke --yes --deep             # Deep clean (+ dangling volumes + TF state)"
    echo "  ./dive nuke --yes --reset-spokes     # Also clear spoke registrations"
    echo "  ./dive checkpoint create             # Save current state"
    echo "  ./dive rollback                      # Restore from latest checkpoint"
    echo ""
    echo -e "${BOLD}Clean Slate Guarantee:${NC}"
    echo "  The nuke command uses multi-pattern discovery to catch:"
    echo "    • All containers matching: dive-*, spoke-*, hub-*"
    echo "    • All volumes matching: dive-*, hub_*, {code}_*"
    echo "    • All networks matching: dive-*, hub-*, *-internal"
    echo "    • Compose project labels: dive-hub, dive-v3"
    echo ""
}
