#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Spoke Operations Sub-Module
# =============================================================================
# Commands: clean, down, reset, teardown
# =============================================================================
# Version: 1.0.0
# Date: 2026-01-07
# =============================================================================

# =============================================================================
# SPOKE CLEANUP (Remove containers, volumes, and optionally config)
# =============================================================================

spoke_clean() {
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    print_header
    echo -e "${BOLD}Cleaning Up Spoke Instance:${NC} ${code_upper}"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would stop and remove all containers for $code_upper"
        log_dry "Would remove all Docker volumes matching: ${code_lower}*"
        log_dry "Would remove instance directory: $spoke_dir"
        return 0
    fi

    # Step 1: Stop containers if running
    if [ -f "$spoke_dir/docker-compose.yml" ]; then
        echo -e "${CYAN}Step 1/3: Stopping containers...${NC}"
        export COMPOSE_PROJECT_NAME="dive-spoke-${code_lower}"
        cd "$spoke_dir"

        if docker compose ps --services --filter "status=running" | grep -q .; then
            docker compose down
            log_success "Containers stopped"
        else
            log_info "No running containers to stop"
        fi
        echo ""
    fi

    # Step 2: Remove Docker volumes
    echo -e "${CYAN}Step 2/3: Removing Docker volumes...${NC}"

    # Change back to DIVE_ROOT to avoid any .env file interference
    cd "$DIVE_ROOT"

    local volumes_removed=0
    local all_volumes=$(docker volume ls --format '{{.Name}}' 2>/dev/null | grep "^dive-spoke-${code_lower}" || true)

    if [ -z "$all_volumes" ]; then
        log_info "No volumes to remove"
    else
        echo "$all_volumes" | while IFS= read -r volume; do
            if [ -n "$volume" ]; then
                log_verbose "Attempting to remove volume: $volume"
                if docker volume rm "$volume" 2>/dev/null; then
                    log_info "Removed volume: $volume"
                    ((volumes_removed++))
                else
                    log_warn "Failed to remove volume: $volume"
                fi
            fi
        done

        if [ $volumes_removed -gt 0 ]; then
            log_success "Removed $volumes_removed Docker volumes"
        else
            log_warn "No volumes were successfully removed"
        fi
    fi
    echo ""

    # Step 3: Remove instance directory
    echo -e "${CYAN}Step 3/3: Removing instance directory...${NC}"
    if [ -d "$spoke_dir" ]; then
        rm -rf "$spoke_dir"
        log_success "Removed instance directory: $spoke_dir"
    else
        log_info "Instance directory already removed"
    fi

    echo ""
    log_success "Spoke cleanup complete for ${code_upper}"
    echo ""
    echo -e "${YELLOW}Note:${NC} This removed all data and configuration for ${code_upper}."
    echo "      To redeploy, run: ./dive spoke deploy ${code_lower} <name>"
    echo ""
}

# =============================================================================
# SPOKE SHUTDOWN (Stop services without removing data)
# =============================================================================

spoke_down() {
    ensure_dive_root
    local instance_code="${1:-${INSTANCE:-usa}}"
    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    print_header
    echo -e "${BOLD}Stopping Spoke Services:${NC} ${code_upper}"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would stop all services for $code_upper"
        return 0
    fi

    if [ ! -f "$spoke_dir/docker-compose.yml" ]; then
        log_error "Spoke not deployed: $instance_code"
        echo ""
        echo "Deploy first: ./dive spoke deploy $instance_code <name>"
        return 1
    fi

    export COMPOSE_PROJECT_NAME="dive-spoke-${code_lower}"
    cd "$spoke_dir"

    echo -e "${CYAN}Stopping services...${NC}"
    if docker compose down; then
        log_success "Services stopped successfully"
        echo ""
        log_info "Data and configuration preserved"
        echo "Restart with: ./dive spoke up"
    else
        log_error "Failed to stop services"
        return 1
    fi
}

# =============================================================================
# SPOKE RESET (Clean data while preserving config)
# =============================================================================

spoke_reset() {
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    print_header
    echo -e "${BOLD}Resetting Spoke Instance:${NC} ${code_upper}"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would reset data for $code_upper while preserving configuration"
        return 0
    fi

    if [ ! -f "$spoke_dir/docker-compose.yml" ]; then
        log_error "Spoke not deployed: $instance_code"
        return 1
    fi

    # Step 1: Stop services
    export COMPOSE_PROJECT_NAME="dive-spoke-${code_lower}"
    cd "$spoke_dir"

    echo -e "${CYAN}Step 1/3: Stopping services...${NC}"
    docker compose down
    log_success "Services stopped"
    echo ""

    # Step 2: Remove data volumes (preserve config)
    echo -e "${CYAN}Step 2/3: Removing data volumes...${NC}"
    local volumes_removed=0

    # Remove database volumes but keep config
    for vol in $(docker volume ls --format '{{.Name}}' | grep "^dive-spoke-${code_lower}" | grep -E "(mongodb|postgres|redis)"); do
        if docker volume rm "$vol" 2>/dev/null; then
            log_info "Removed data volume: $vol"
            ((volumes_removed++))
        fi
    done

    log_success "Removed $volumes_removed data volumes"
    echo ""

    # Step 3: Clean up old containers
    echo -e "${CYAN}Step 3/3: Cleaning up containers...${NC}"
    docker system prune -f --volumes >/dev/null 2>&1
    log_success "Containers cleaned up"
    echo ""

    log_success "Spoke reset complete for ${code_upper}"
    echo ""
    echo -e "${YELLOW}Note:${NC} Configuration preserved, data reset."
    echo "      Services will reinitialize on next startup."
    echo "      Start with: ./dive spoke up"
    echo ""
}

# =============================================================================
# SPOKE TEARDOWN (DESTRUCTIVE - Full removal)
# =============================================================================

spoke_teardown() {
    local instance_code="${1:-$INSTANCE}"
    local notify_hub="${2:-}"

    if [ -z "$instance_code" ]; then
        log_error "Instance code required"
        echo ""
        echo "Usage: ./dive spoke teardown <CODE> [--notify-hub]"
        echo ""
        echo "Examples:"
        echo "  ./dive spoke teardown FRA"
        echo "  ./dive spoke teardown DEU --notify-hub"
        return 1
    fi

    ensure_dive_root
    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    print_header
    echo -e "${BOLD}🛑 DESTRUCTIVE OPERATION${NC}"
    echo -e "${BOLD}Complete Spoke Teardown:${NC} ${code_upper}"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would completely remove spoke $code_upper"
        return 0
    fi

    # Confirm destructive operation
    echo -e "${RED}⚠️  WARNING: This will permanently delete:${NC}"
    echo "   • All containers and services"
    echo "   • All data volumes and databases"
    echo "   • All configuration and certificates"
    echo "   • The entire instance directory"
    echo ""
    echo -e "${RED}This action CANNOT be undone!${NC}"
    echo ""

    if ! confirm_action "Are you sure you want to completely destroy spoke ${code_upper}?"; then
        log_info "Teardown cancelled"
        return 0
    fi

    # Optional: Notify hub before teardown
    if [ "$notify_hub" = "--notify-hub" ] && [ -f "$spoke_dir/config.json" ]; then
        echo -e "${CYAN}Notifying Hub of teardown...${NC}"
        # Extract hub URL and token if available
        local hub_url=$(grep -o '"hubUrl"[[:space:]]*:[[:space:]]*"[^"]*"' "$spoke_dir/config.json" 2>/dev/null | cut -d'"' -f4)
        local spoke_id=$(grep -o '"spokeId"[[:space:]]*:[[:space:]]*"[^"]*"' "$spoke_dir/config.json" 2>/dev/null | cut -d'"' -f4)

        if [ -n "$hub_url" ] && [ -n "$spoke_id" ]; then
            # Try to notify hub (best effort)
            curl -kfs -X DELETE "${hub_url}/api/federation/spokes/${spoke_id}" \
                -H "Content-Type: application/json" \
                -d '{"reason": "spoke_teardown"}' >/dev/null 2>&1 && \
                log_info "Hub notified of teardown" || \
                log_warn "Could not notify hub"
        fi
        echo ""
    fi

    # Step 1: Stop and remove containers
    if [ -f "$spoke_dir/docker-compose.yml" ]; then
        echo -e "${CYAN}Step 1/4: Stopping and removing containers...${NC}"
        export COMPOSE_PROJECT_NAME="dive-spoke-${code_lower}"
        cd "$spoke_dir"
        docker compose down -v --remove-orphans
        log_success "Containers removed"
        echo ""
    fi

    # Step 2: Remove all Docker volumes
    echo -e "${CYAN}Step 2/4: Removing all Docker volumes...${NC}"
    local volumes_removed=0
    while IFS= read -r volume; do
        if [ -n "$volume" ]; then
            if docker volume rm "$volume" 2>/dev/null; then
                ((volumes_removed++))
            fi
        fi
    done < <(docker volume ls --format '{{.Name}}' | grep "^dive-spoke-${code_lower}")

    log_success "Removed $volumes_removed Docker volumes"
    echo ""

    # Step 3: Remove Docker networks
    echo -e "${CYAN}Step 3/4: Removing Docker networks...${NC}"
    local networks_removed=0
    while IFS= read -r network; do
        if [ -n "$network" ]; then
            if docker network rm "$network" 2>/dev/null; then
                ((networks_removed++))
            fi
        fi
    done < <(docker network ls --format '{{.Name}}' | grep "^dive-spoke-${code_lower}")

    if [ $networks_removed -gt 0 ]; then
        log_success "Removed $networks_removed Docker networks"
    fi
    echo ""

    # Step 4: Remove instance directory
    echo -e "${CYAN}Step 4/4: Removing instance directory...${NC}"
    if [ -d "$spoke_dir" ]; then
        rm -rf "$spoke_dir"
        log_success "Removed instance directory: $spoke_dir"
    fi

    echo ""
    echo -e "${RED}🛑 COMPLETE TEARDOWN FINISHED${NC}"
    echo ""
    log_success "Spoke ${code_upper} has been completely destroyed"
    echo ""
    echo -e "${YELLOW}Note:${NC} All data, configuration, and services permanently removed."
    echo "      To redeploy, run: ./dive spoke deploy ${code_lower} <name>"
    echo ""
}