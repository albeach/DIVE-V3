#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Nuke Command Helpers
# =============================================================================
# Surgical destruction: hub-only, spoke-only, or full environment teardown.
# Sourced by deploy.sh.
# =============================================================================

# Prevent multiple sourcing
[ -n "${DIVE_DEPLOY_NUKE_LOADED:-}" ] && return 0
export DIVE_DEPLOY_NUKE_LOADED=1

# =============================================================================
# NUKE HELPER FUNCTIONS (Modular Architecture)
# =============================================================================

##
# Parse nuke command arguments
# Sets global variables: confirm_flag, force_flag, keep_images, reset_spokes,
#                        deep_clean, target_type, target_instance
# Returns: 0 on success, 1 on validation error
##
_nuke_parse_arguments() {
    confirm_flag=false
    _force_flag=false
    keep_images=false
    reset_spokes=false
    deep_clean=false
    target_type="all"  # New: all, hub, spoke, volumes, networks, orphans
    target_instance=""  # New: specific spoke instance code

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --confirm|--yes|-y)
                confirm_flag=true
                shift
                ;;
            --force|-f)
                _force_flag=true
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

    return 0
}

##
# Show nuke help/usage information
# No parameters, just prints help text
##
_nuke_show_help() {
    log_error "NUKE requires explicit confirmation. Use --confirm or --yes"
    echo ""
    echo "  Safe usage:"
    echo "    ./dive nuke hub --confirm                    # Nuke Hub only"
    echo "    ./dive nuke spoke ALB --confirm              # Nuke specific spoke"
    echo "    ./dive nuke all --confirm                    # Nuke everything"
    echo ""
    echo "  Options:"
    echo "    --keep-images                                # Keep Docker images (faster redeployment)"
    echo "    --deep or --deep-clean                       # FULL CLEAN SLATE: removes all images, builder cache,"
    echo "                                                 # and Terraform state (recommended for debugging)"
    echo "    --reset-spokes                               # Clear spoke federation registrations"
    echo ""
    echo "  What gets cleaned (nuke all):"
    echo "    - All DIVE containers, volumes, networks"
    echo "    - Instance directories (instances/gbr/, etc.)"
    echo "    - Checkpoint directory (.dive-checkpoint/)"
    echo "    - Orchestration database (.dive-orch.db)"
    echo "    - State directory (.dive-state/)"
    echo "    - Terraform state for hub/spoke"
    echo "    + With --deep: ALL Docker images, builder cache, ALL Terraform caches"
    echo ""
    echo "  Examples:"
    echo "    ./dive nuke all --confirm                   # Standard nuke (keeps images)"
    echo "    ./dive nuke all --confirm --deep            # FULL CLEAN SLATE (recommended)"
    echo "    ./dive nuke hub --confirm --keep-images     # Fast hub reset (keeps images)"
    echo ""
}

##
# Discover nuke target resources based on target_type
# Uses global variables: target_type, target_instance, keep_images
# Sets global variables: dive_containers, dive_volumes, dive_networks,
#                        container_count, volume_count, network_count,
#                        dangling_count, image_count, scope_description,
#                        container_patterns, volume_patterns, network_patterns
##
_nuke_discover_resources() {
    container_patterns=""
    volume_patterns=""
    network_patterns=""
    scope_description=""

    case "$target_type" in
        hub)
            container_patterns="dive-hub-"
            volume_patterns="^dive-hub_"
            network_patterns="^dive-hub_"
            scope_description="Hub resources only"
            ;;
        spoke)
            local instance_lower
            instance_lower=$(echo "$target_instance" | tr '[:upper:]' '[:lower:]')
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

    # Discover containers using batch query (single docker call instead of per-container inspect)
    dive_containers=""
    container_count=0
    if [ -n "$container_patterns" ] || [ "$target_type" = "orphans" ]; then
        local container_listing
        container_listing=$(docker ps -a --format '{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Labels}}\t{{.Status}}' 2>/dev/null)

        while IFS=$'\t' read -r c_id c_name c_image c_labels c_status; do
            [ -z "$c_id" ] && continue

            # Extract compose project from labels inline
            local project_label=""
            if [[ "$c_labels" == *"com.docker.compose.project="* ]]; then
                project_label="${c_labels##*com.docker.compose.project=}"
                project_label="${project_label%%,*}"
            fi

            # Check if container is anonymous (no name or name equals ID)
            local is_anonymous=false
            if [ -z "$c_name" ] || [ "$c_name" = "$c_id" ] || [ "${#c_name}" -eq 64 ]; then
                is_anonymous=true
            fi

            if [ "$target_type" = "orphans" ]; then
                if [[ "$c_status" != Up* ]]; then
                    dive_containers="$dive_containers $c_id"
                fi
            elif [ "$is_anonymous" = true ]; then
                # Anonymous container - check if it's DIVE-related by image or label
                if echo "$c_image" | grep -qE "postgres|mongodb|redis|keycloak|opa|opal|dive|ghcr.io/opentdf"; then
                    dive_containers="$dive_containers $c_id"
                elif echo "$project_label" | grep -qE "^dive-"; then
                    dive_containers="$dive_containers $c_id"
                fi
            elif echo "$c_name" | grep -qE "$container_patterns"; then
                dive_containers="$dive_containers $c_id"
            fi
        done <<< "$container_listing"
        container_count=$(echo $dive_containers | wc -w | tr -d ' ')
    fi

    # Discover volumes
    dive_volumes=""
    volume_count=0
    if [ -n "$volume_patterns" ] || [ "$target_type" = "volumes" ] || [ "$target_type" = "all" ] || [ "$target_type" = "orphans" ]; then
        local all_volumes
        all_volumes=$(docker volume ls -q 2>/dev/null)
        for v in $all_volumes; do
            if [ "$target_type" = "orphans" ]; then
                # Check if dangling
                if ${DOCKER_CMD:-docker} volume ls -qf "dangling=true" 2>/dev/null | grep -q "^${v}$"; then
                    dive_volumes="$dive_volumes $v"
                fi
            elif [ -n "$volume_patterns" ] && echo "$v" | grep -qE "$volume_patterns"; then
                dive_volumes="$dive_volumes $v"
            fi
        done
        volume_count=$(echo $dive_volumes | wc -w | tr -d ' ')
    fi

    # Discover networks
    dive_networks=""
    network_count=0
    if [ -n "$network_patterns" ] || [ "$target_type" = "networks" ] || [ "$target_type" = "all" ]; then
        local all_networks
        all_networks=$(docker network ls --format '{{.Name}}' 2>/dev/null)
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
    dangling_count=0
    if [ "$target_type" = "orphans" ] || [ "$target_type" = "all" ]; then
        dangling_count=$(docker volume ls -qf dangling=true 2>/dev/null | wc -l | tr -d ' ')
    fi

    # Images
    image_count=0
    if [ "$keep_images" = false ] && [ "$target_type" = "all" ]; then
        image_count=$(docker images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | grep -E "dive|ghcr.io/opentdf" | wc -l | tr -d ' ')
    fi
}

##
# Show nuke operation summary
# Uses global variables from _nuke_discover_resources
# Displays what will be removed before confirmation
##
_nuke_show_summary() {
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
            [ -d "$spoke_dir" ] && spoke_count=$((spoke_count + 1))
        done
        echo "    - Spoke Configs:                ${spoke_count} (all registration data will be cleared)"
    fi
    if [ "$deep_clean" = true ]; then
        echo ""
        echo -e "    ${YELLOW}--deep mode: Will also remove ALL dangling resources${NC}"
    fi
    echo ""
}

##
# Handle dry-run mode summary
# Uses global variables: container_count, volume_count, etc.
##
_nuke_dry_run() {
    log_dry "Target: ${target_type}"
    log_dry "Phase 1: Stop compose projects"
    [ "$container_count" -gt 0 ] && log_dry "Phase 2: Force-remove ${container_count} containers"
    [ "$volume_count" -gt 0 ] && log_dry "Phase 3: Force-remove ${volume_count} named volumes"
    [ "$dangling_count" -gt 0 ] && log_dry "Phase 3b: Remove ${dangling_count} dangling volumes"
    [ "$network_count" -gt 0 ] && log_dry "Phase 4: Force-remove ${network_count} networks"
    [ "$image_count" -gt 0 ] && log_dry "Phase 5: Remove ${image_count} images"
    if [ "$target_type" = "all" ]; then
        log_dry "Phase 6: ${DOCKER_CMD:-docker} system prune -f --volumes"
        log_dry "Phase 7: Cleanup checkpoint directory"
    fi
}

##
# Prompt user for final confirmation
# Uses global variables: confirm_flag, target_type, scope_description
# Returns: 0 if confirmed, 1 if cancelled
##
_nuke_confirm_destruction() {
    # Skip if already confirmed via --confirm/--yes/--force flag
    if [ "$confirm_flag" = true ]; then
        return 0
    fi
    # SAFETY: Non-interactive mode requires explicit --confirm for destructive ops
    if ! is_interactive; then
        log_error "Nuke requires --confirm flag in non-interactive mode"
        log_error "Usage: ./dive --non-interactive nuke all --confirm"
        return 1
    fi

    echo -e "${YELLOW}This action cannot be undone.${NC}"
    if [ "$target_type" = "all" ]; then
        read -r -p "Type 'yes' to confirm complete destruction: " user_confirm
    else
        read -r -p "Type 'yes' to confirm removal of ${scope_description}: " user_confirm
    fi
    if [ "$user_confirm" != "yes" ]; then
        return 1
    fi
    return 0
}

##
# Stop targeted Docker Compose projects
# Uses global variables: target_type, target_instance
##
_nuke_stop_compose_projects() {
    if [ "$target_type" = "hub" ]; then
        # Stop only hub — include ALL profiles so Vault HA volumes are also removed
        if [ -f "docker-compose.hub.yml" ]; then
            log_verbose "  Stopping hub (all profiles including vault-ha)"
            if ! ${DOCKER_CMD:-docker} compose -f docker-compose.hub.yml -p dive-hub \
                --profile vault-ha --profile vault-dev --profile caddy \
                down -v --remove-orphans --timeout 5 2>&1 | grep -v "^$"; then
                log_warn "Hub compose down returned errors (continuing cleanup)"
            fi
        fi
    elif [ "$target_type" = "spoke" ]; then
        # Stop only specific spoke
        local instance_lower
        instance_lower=$(echo "$target_instance" | tr '[:upper:]' '[:lower:]')
        local instance_dir="instances/${instance_lower}"
        if [ -f "${instance_dir}/docker-compose.yml" ]; then
            log_verbose "  Stopping spoke: ${target_instance^^}"
            if ! (cd "$instance_dir" && ${DOCKER_CMD:-docker} compose -p "dive-spoke-${instance_lower}" down -v --remove-orphans --timeout 5 2>&1); then
                log_warn "Spoke ${target_instance^^} compose down returned errors (continuing cleanup)"
            fi
        fi
    elif [ "$target_type" = "all" ]; then
        # Stop all compose projects
        # Main compose files
        for compose_file in docker-compose.yml docker-compose.hub.yml docker-compose.pilot.yml docker-compose.prod.yml; do
            if [ -f "$compose_file" ]; then
                local project_name
                project_name=$(grep -m 1 '^name:' "$compose_file" 2>/dev/null | sed 's/name: *//' | tr -d ' "'"'"'')
                if [ -n "$project_name" ]; then
                    log_verbose "  Stopping project: $project_name (all profiles)"
                    if ! ${DOCKER_CMD:-docker} compose -f "$compose_file" -p "$project_name" \
                        --profile vault-ha --profile vault-dev --profile caddy \
                        down -v --remove-orphans --timeout 5 2>&1 | grep -v "^$"; then
                        log_warn "Compose down for $project_name returned errors (continuing cleanup)"
                    fi
                else
                    if ! ${DOCKER_CMD:-docker} compose -f "$compose_file" \
                        --profile vault-ha --profile vault-dev --profile caddy \
                        down -v --remove-orphans --timeout 5 2>&1 | grep -v "^$"; then
                        log_warn "Compose down for $compose_file returned errors (continuing cleanup)"
                    fi
                fi
            fi
        done

        # Instance-specific compose files (all spokes)
        # CRITICAL FIX: Use explicit project name to ensure all containers are stopped
        for instance_dir in instances/*/; do
            if [ -f "${instance_dir}docker-compose.yml" ]; then
                local instance_code
                instance_code=$(basename "$instance_dir")
                local instance_lower
                instance_lower=$(echo "$instance_code" | tr '[:upper:]' '[:lower:]')
                log_verbose "  Stopping spoke: ${instance_code^^} (project: dive-spoke-${instance_lower})"
                # Use explicit project name to match container labels
                if ! (cd "$instance_dir" && ${DOCKER_CMD:-docker} compose -p "dive-spoke-${instance_lower}" down -v --remove-orphans --timeout 5 2>&1); then
                    log_warn "Spoke ${instance_code^^} compose down returned errors (continuing cleanup)"
                fi
                # Force-stop any remaining containers for this instance
                for c in $(docker ps -aq --filter "label=com.docker.compose.project=dive-spoke-${instance_lower}" 2>/dev/null); do
                    ${DOCKER_CMD:-docker} stop "$c" 2>/dev/null || true
                    ${DOCKER_CMD:-docker} rm -f "$c" 2>/dev/null || true
                done
            fi
        done
    else
        # For volumes/networks/orphans, no compose stop needed
        log_verbose "  Skipping compose stop (target_type: ${target_type})"
    fi
}

##
# Remove discovered containers
# Uses global variables: dive_containers, target_type, target_instance
# Returns: Number of containers removed
##
_nuke_remove_containers() {
    local removed_containers=0
    for c in $dive_containers; do
        if ${DOCKER_CMD:-docker} rm -f "$c" 2>/dev/null; then
            removed_containers=$((removed_containers + 1))
        fi
    done

    # Also catch by compose project label — ONLY for the current target (surgical nuke)
    case "$target_type" in
        hub)
            for c in $(docker ps -aq --filter "label=com.docker.compose.project=dive-hub" 2>/dev/null); do
                if ${DOCKER_CMD:-docker} rm -f "$c" 2>/dev/null; then
                    removed_containers=$((removed_containers + 1))
                fi
            done
            ;;
        spoke)
            local instance_lower
            instance_lower=$(echo "$target_instance" | tr '[:upper:]' '[:lower:]')
            for c in $(docker ps -aq --filter "label=com.docker.compose.project=dive-spoke-${instance_lower}" 2>/dev/null); do
                if ${DOCKER_CMD:-docker} rm -f "$c" 2>/dev/null; then
                    removed_containers=$((removed_containers + 1))
                fi
            done
            ;;
        all)
            for label in "com.docker.compose.project=dive-hub" "com.docker.compose.project=dive-v3"; do
                for c in $(docker ps -aq --filter "label=$label" 2>/dev/null); do
                    if ${DOCKER_CMD:-docker} rm -f "$c" 2>/dev/null; then
                        removed_containers=$((removed_containers + 1))
                    fi
                done
            done
            for c in $(docker ps -aq --filter "label=com.docker.compose.project" 2>/dev/null); do
                local project_label
                project_label=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$c" 2>/dev/null)
                if echo "$project_label" | grep -qE "^dive-spoke-|^dive-hub$"; then
                    if ${DOCKER_CMD:-docker} rm -f "$c" 2>/dev/null; then
                        removed_containers=$((removed_containers + 1))
                    fi
                fi
            done
            ;;
        *) ;;
    esac

    # Port-based cleanup for spoke or all (BEST PRACTICE: Force-stop containers holding ports)
    if [ "$target_type" = "spoke" ] || [ "$target_type" = "all" ]; then
        if [ "$target_type" = "spoke" ]; then
            # Spoke-specific: Determine ports from get_instance_ports (SSOT)
            local instance_lower
            instance_lower=$(echo "$target_instance" | tr '[:upper:]' '[:lower:]')
            local instance_upper
            instance_upper=$(echo "$target_instance" | tr '[:lower:]' '[:upper:]')

            local spoke_ports=()
            eval "$(get_instance_ports "$instance_upper")"
            [ -n "${SPOKE_FRONTEND_PORT:-}" ] && spoke_ports+=("$SPOKE_FRONTEND_PORT")
            [ -n "${SPOKE_BACKEND_PORT:-}" ] && spoke_ports+=("$SPOKE_BACKEND_PORT")
            [ -n "${SPOKE_KEYCLOAK_HTTPS_PORT:-}" ] && spoke_ports+=("$SPOKE_KEYCLOAK_HTTPS_PORT")
            [ -n "${SPOKE_KAS_PORT:-}" ] && spoke_ports+=("$SPOKE_KAS_PORT")

            if [ ${#spoke_ports[@]} -gt 0 ]; then
                log_verbose "  Force-stopping containers using spoke ${target_instance^^} ports: ${spoke_ports[*]}..."
                for port in "${spoke_ports[@]}"; do
                    for c in $(docker ps --format '{{.ID}}\t{{.Names}}\t{{.Ports}}' 2>/dev/null | grep -E ":$port->|:$port/" | awk '{print $1}'); do
                        local container_name
                        container_name=$(docker inspect --format '{{.Name}}' "$c" 2>/dev/null | sed 's/^\///')
                        if echo "$container_name" | grep -qE "dive-spoke-${instance_lower}"; then
                            log_verbose "    Force-stopping container on port $port: $container_name"
                            ${DOCKER_CMD:-docker} stop "$c" 2>/dev/null || true
                            ${DOCKER_CMD:-docker} rm -f "$c" 2>/dev/null || true
                            removed_containers=$((removed_containers + 1))
                        fi
                    done
                done
            else
                log_verbose "  No ports resolved from get_instance_ports - using pattern-based cleanup only"
            fi
        elif [ "$target_type" = "all" ]; then
            # Batch: stop DIVE containers on known ports (single docker ps call)
            log_verbose "  Stopping containers using DIVE ports..."
            # Known DIVE ports: base (3000/4000/8443) + spoke offsets (32-34)
            local port_pattern="${DIVE_NUKE_PORT_PATTERN:-:(3033|4033|8476|3032|4032|8475|3034|4034|8477|8443|4000|3000)->}"
            while IFS=$'\t' read -r c_id c_name c_ports; do
                [ -z "$c_id" ] && continue
                if echo "$c_ports" | grep -qE "$port_pattern"; then
                    if echo "$c_name" | grep -qE "dive|spoke|hub"; then
                        log_verbose "    Stopping container: $c_name"
                        ${DOCKER_CMD:-docker} stop "$c_id" 2>/dev/null || true
                        ${DOCKER_CMD:-docker} rm -f "$c_id" 2>/dev/null || true
                        removed_containers=$((removed_containers + 1))
                    fi
                fi
            done <<< "$(docker ps --format '{{.ID}}\t{{.Names}}\t{{.Ports}}' 2>/dev/null)"

            # Batch: remove anonymous DIVE-related containers (single docker ps call)
            log_verbose "  Removing anonymous DIVE-related containers..."
            local anonymous_removed=0
            while IFS=$'\t' read -r c_id c_name c_image c_labels; do
                [ -z "$c_id" ] && continue
                local is_anonymous=false
                if [ -z "$c_name" ] || [ "$c_name" = "$c_id" ] || [ "${#c_name}" -eq 64 ]; then
                    is_anonymous=true
                fi
                if [ "$is_anonymous" = true ]; then
                    local project_label=""
                    if [[ "$c_labels" == *"com.docker.compose.project="* ]]; then
                        project_label="${c_labels##*com.docker.compose.project=}"
                        project_label="${project_label%%,*}"
                    fi
                    if echo "$c_image" | grep -qE "postgres|mongodb|redis|keycloak|opa|opal|dive|ghcr.io/opentdf|openpolicyagent|permitio"; then
                        log_verbose "    Removing anonymous DIVE container: $c_id (image: $c_image)"
                        ${DOCKER_CMD:-docker} rm -f "$c_id" 2>/dev/null && anonymous_removed=$((anonymous_removed + 1)) || true
                    elif echo "$project_label" | grep -qE "^dive-"; then
                        log_verbose "    Removing anonymous DIVE container: $c_id (project: $project_label)"
                        ${DOCKER_CMD:-docker} rm -f "$c_id" 2>/dev/null && anonymous_removed=$((anonymous_removed + 1)) || true
                    fi
                fi
            done <<< "$(docker ps -a --format '{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Labels}}' 2>/dev/null)"
            [ "$anonymous_removed" -gt 0 ] && removed_containers=$((removed_containers + anonymous_removed)) && log_verbose "    Removed $anonymous_removed anonymous containers"
        fi
    fi

    echo "$removed_containers"
}

##
# Remove discovered volumes
# Uses global variables: dive_volumes, deep_clean, target_type
# Returns: Number of volumes removed
##

# Load nuke cleanup helpers
source "$(dirname "${BASH_SOURCE[0]}")/deploy-nuke-cleanup.sh"

# =============================================================================
# NUKE COMMAND (FULLY IDEMPOTENT - ENHANCED FOR 100% CLEANUP)
# =============================================================================

cmd_nuke() {
    # Parse arguments and validate
    _nuke_parse_arguments "$@" || return 1

    # Show help if no confirmation flag
    if [ "$confirm_flag" != true ]; then
        _nuke_show_help
        return 1
    fi

    # Setup environment
    ensure_dive_root
    cd "$DIVE_ROOT" || exit 1

    # Load naming utilities if available
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/utilities/naming.sh" ]; then
        # shellcheck source=./utilities/naming.sh
        source "${DIVE_ROOT}/scripts/dive-modules/utilities/naming.sh"
    fi

    # Discover target resources
    _nuke_discover_resources

    # Show what will be removed
    _nuke_show_summary

    # Handle dry-run mode
    if [ "$DRY_RUN" = true ]; then
        _nuke_dry_run
        return 0
    fi

    # Get final user confirmation
    if ! _nuke_confirm_destruction; then
        log_info "Nuke cancelled"
        return 1
    fi

    # Display starting message
    if [ "$target_type" = "all" ]; then
        log_warn "NUKING EVERYTHING..."
    else
        log_warn "Removing ${scope_description}..."
    fi
    echo ""

    # Execute nuke phases
    log_step "Phase 1: Stopping Docker Compose projects..."
    _nuke_stop_compose_projects

    log_step "Phase 2/7: Force-removing DIVE containers (${scope_description})..."
    local removed_containers
    removed_containers=$(_nuke_remove_containers)
    log_verbose "  Removed $removed_containers containers total"

    log_step "Phase 3/7: Force-removing DIVE volumes (${scope_description})..."
    local removed_volumes
    removed_volumes=$(_nuke_remove_volumes)
    log_verbose "  Removed $removed_volumes volumes"

    log_step "Phase 4/7: Force-removing DIVE networks (${scope_description})..."
    local removed_networks
    removed_networks=$(_nuke_remove_networks)
    log_verbose "  Removed $removed_networks networks"

    if [ "$keep_images" = false ]; then
        log_step "Phase 5/7: Removing DIVE images..."
        _nuke_remove_images
    else
        log_step "Phase 5/7: Skipping images (--keep-images)"
    fi

    if [ "$target_type" = "all" ]; then
        log_step "Phase 6/7: Final system prune..."
        _nuke_system_prune
    else
        log_step "Phase 6/7: Skipping system prune (target is ${target_type} only)"
        log_verbose "  System prune only runs for './dive nuke all --confirm'"
    fi

    log_step "Phase 7/7: Cleaning local state..."
    _nuke_cleanup_state

    # Verify cleanup
    echo ""
    log_step "Verifying clean state for ${scope_description}..."
    _nuke_verify_clean
}
