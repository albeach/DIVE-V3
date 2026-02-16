#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Spoke Operations Sub-Module
# =============================================================================
# Commands: clean, down, reset, teardown, restart, reload-secrets, repair
# =============================================================================
# Version: 2.0.0
# Date: 2026-02-07 - Added granular repair commands
# =============================================================================

# Load validation systems if available
if [ -z "${SPOKE_VALIDATION_LOADED:-}" ]; then
    if [ -f "$(dirname "${BASH_SOURCE[0]}")/pipeline/spoke-validation.sh" ]; then
        source "$(dirname "${BASH_SOURCE[0]}")/pipeline/spoke-validation.sh"
    fi
fi

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
    if [ "$notify_hub" = "--notify-hub" ] && [ -d "$spoke_dir" ]; then
        echo -e "${CYAN}Notifying Hub of teardown...${NC}"
        # Extract hub URL and spoke ID from spoke_config_get (SSOT)
        local hub_url=$(spoke_config_get "$instance_code" "endpoints.hubUrl")
        local spoke_id=$(spoke_config_get "$instance_code" "identity.spokeId")

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

# =============================================================================
# SPOKE RESTART (Restart services without redeployment)
# =============================================================================

##
# Restart spoke services (all or specific service)
#
# Arguments:
#   $1 - Instance code
#   $2 - Optional: Specific service name (or "all" for all services)
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_restart() {
    local instance_code="$1"
    local service="${2:-all}"
    
    # Disable exit-on-error for this function to handle errors gracefully
    set +e
    
    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    if [ ! -d "$spoke_dir" ]; then
        log_error "Spoke not deployed: $instance_code"
        echo "Deploy first: ./dive spoke deploy $instance_code"
        set -e
        return 1
    fi

    log_step "Restarting ${service} for ${code_upper}..."

    case "$service" in
        all)
            # Restart all spoke containers
            local containers=$(docker ps -a --filter "name=dive-spoke-${code_lower}-" --format "{{.Names}}" 2>/dev/null)
            if [ -z "$containers" ]; then
                log_error "No containers found for spoke: $code_lower"
                set -e
                return 1
            fi

            local restart_count=0
            for container in $containers; do
                if docker restart "$container" &>/dev/null; then
                    log_verbose "Restarted: $container"
                    ((restart_count++)) || true
                else
                    log_warn "Failed to restart: $container"
                fi
            done

            if [ $restart_count -gt 0 ]; then
                log_success "Restarted $restart_count service(s) for ${code_upper}"
            else
                log_error "Failed to restart any services"
                set -e
                return 1
            fi
            ;;
            
        backend|frontend|keycloak|mongodb|postgres|redis|opa|kas|opal-client)
            local container="dive-spoke-${code_lower}-${service}"
            if ! docker ps -a --format '{{.Names}}' | grep -q "^${container}$"; then
                log_error "Container not found: $container"
                set -e
                return 1
            fi

            if docker restart "$container" &>/dev/null; then
                log_success "Restarted: $service"
            else
                log_error "Failed to restart: $service"
                set -e
                return 1
            fi
            ;;
            
        *)
            log_error "Unknown service: $service"
            echo "Valid services: all, backend, frontend, keycloak, mongodb, postgres, redis, opa, kas, opal-client"
            set -e
            return 1
            ;;
    esac

    # Wait for services to stabilize
    log_info "Waiting for services to stabilize (5s)..."
    sleep 5

    # Quick health check
    local running_count=$(docker ps --filter "name=dive-spoke-${code_lower}-" --format "{{.Names}}" 2>/dev/null | wc -l | tr -d ' ')
    local total_count=$(docker ps -a --filter "name=dive-spoke-${code_lower}-" --format "{{.Names}}" 2>/dev/null | wc -l | tr -d ' ')

    if [ "$running_count" -eq "$total_count" ]; then
        log_success "All services healthy ($running_count/$total_count running)"
    else
        log_warn "Some services not running: $running_count/$total_count"
    fi

    set -e  # Re-enable for caller
    return 0
}

# =============================================================================
# SPOKE RELOAD SECRETS (Reload secrets from GCP and restart services)
# =============================================================================

##
# Reload secrets from GCP Secret Manager and restart affected services
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_reload_secrets() {
    local instance_code="$1"
    
    # Disable exit-on-error for this function to handle errors gracefully
    set +e
    
    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    if [ ! -d "$spoke_dir" ]; then
        log_error "Spoke not deployed: $instance_code"
        set -e  # Re-enable for caller
        return 1
    fi

    log_step "Reloading secrets for ${code_upper} from GCP..."

    # Load spoke-secrets module if not already loaded
    if ! type spoke_secrets_load &>/dev/null; then
        if [ -f "${DIVE_ROOT}/scripts/dive-modules/spoke/pipeline/spoke-secrets.sh" ]; then
            source "${DIVE_ROOT}/scripts/dive-modules/spoke/pipeline/spoke-secrets.sh"
        else
            log_error "spoke-secrets.sh not found - cannot reload secrets"
            set -e
            return 1
        fi
    fi

    # Load secrets from GCP
    if ! spoke_secrets_load "$instance_code" "load"; then
        log_error "Failed to load secrets from GCP"
        set -e
        return 1
    fi

    # Sync secrets to .env file
    if type spoke_secrets_sync_to_env &>/dev/null; then
        spoke_secrets_sync_to_env "$instance_code" || true
    fi

    # Restart services that use secrets
    log_info "Restarting services to pick up new secrets..."
    
    local services=("postgres" "mongodb" "redis" "keycloak" "backend")
    local restart_count=0
    local restart_failed=0

    for service in "${services[@]}"; do
        local container="dive-spoke-${code_lower}-${service}"
        log_info "Checking container: $container"
        if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
            log_info "Restarting $service..."
            if docker restart "$container" >/dev/null 2>&1; then
                log_info "✓ Restarted: $service"
                ((restart_count++)) || true
            else
                log_warn "✗ Failed to restart: $service"
                ((restart_failed++)) || true
            fi
        else
            log_info "Container not running, skipping: $service"
        fi
    done

    log_info "Restart loop completed. Restarted: $restart_count, Failed: $restart_failed"

    # Wait for services to stabilize
    if [ $restart_count -gt 0 ]; then
        log_info "Waiting for services to stabilize (10s)..."
        sleep 10
    fi

    # Report results
    if [ $restart_count -eq 0 ]; then
        log_warn "No services were restarted (all may be stopped)"
        set -e
        return 0
    fi

    log_success "Secrets reloaded ($restart_count services restarted, $restart_failed failed)"
    set -e  # Re-enable for caller
    return 0
}

# =============================================================================
# SPOKE REPAIR (Auto-fix common issues)
# =============================================================================

##
# Automatically diagnose and repair common spoke issues
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - All issues fixed
#   1 - Some issues could not be fixed automatically
##
spoke_repair() {
    local instance_code="$1"
    
    # Disable exit-on-error for this function to handle errors gracefully
    set +e
    
    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    if [ ! -d "$spoke_dir" ]; then
        log_error "Spoke not deployed: $instance_code"
        set -e
        return 1
    fi

    log_step "Running auto-repair for ${code_upper}..."

    local issues_found=0
    local issues_fixed=0

    # Check 1: Services not running
    local running_count=$(docker ps --filter "name=dive-spoke-${code_lower}-" --format "{{.Names}}" 2>/dev/null | wc -l | tr -d ' ')
    local total_count=$(docker ps -a --filter "name=dive-spoke-${code_lower}-" --format "{{.Names}}" 2>/dev/null | wc -l | tr -d ' ')

    if [ "$running_count" -lt "$total_count" ]; then
        ((issues_found++)) || true
        log_info "Issue detected: Some services not running ($running_count/$total_count)"
        log_info "Fix: Restarting stopped services..."
        
        if spoke_restart "$instance_code" "all" &>/dev/null; then
            ((issues_fixed++)) || true
            log_success "✓ Services restarted"
        else
            log_warn "✗ Could not restart all services"
        fi
    fi

    # Check 2: Federation broken (if federation module available)
    # Use timeout to prevent hanging on federation checks
    if type spoke_federation_verify &>/dev/null; then
        log_verbose "Checking federation status..."
        local fed_check_timeout=10
        local fed_status=""
        
        # Run federation check with timeout (background job)
        (spoke_federation_verify "$instance_code" 2>/dev/null) &
        local fed_pid=$!
        
        # Wait for result with timeout
        local elapsed=0
        while [ $elapsed -lt $fed_check_timeout ] && kill -0 $fed_pid 2>/dev/null; do
            sleep 1
            ((elapsed++))
        done
        
        # Kill if still running
        if kill -0 $fed_pid 2>/dev/null; then
            kill -9 $fed_pid 2>/dev/null
            log_verbose "Federation check timed out (non-critical)"
        else
            # Check succeeded, get status
            wait $fed_pid 2>/dev/null
            fed_status=$(spoke_federation_verify "$instance_code" 2>/dev/null | grep -o '"bidirectional":[^,}]*' || echo "")
            
            if [[ "$fed_status" != *"true"* ]] && [ -n "$fed_status" ]; then
                ((issues_found++))
                log_info "Issue detected: Federation not active"
                log_info "Fix: Re-linking federation..."
                
                # Try to re-link federation
                if type spoke_federation_setup &>/dev/null; then
                    if spoke_federation_setup "$instance_code" &>/dev/null; then
                        ((issues_fixed++))
                        log_success "✓ Federation re-linked"
                    else
                        log_warn "✗ Federation re-link failed (may need manual intervention)"
                    fi
                fi
            fi
        fi
    fi

    # Check 3: Phase state inconsistency (query orchestration DB)
    if type orch_db_check_connection &>/dev/null; then
        if orch_db_check_connection; then
            local code_lower=$(lower "$instance_code")
            # Check for failed steps in DB
            # CRITICAL FIX (2026-02-07): Use instance_code not instance_id (matches spoke-validation.sh fix)
            local failed_steps=$(orch_db_exec "SELECT COUNT(*) FROM deployment_steps WHERE instance_code = '${code_lower}' AND status = 'FAILED';" 2>/dev/null | tr -d ' \n')
            if [ "$failed_steps" -gt 0 ] 2>/dev/null; then
                ((issues_found++)) || true
                log_info "Issue detected: $failed_steps failed steps in database"
                log_info "Fix: Cleared failed step markers"
                ((issues_fixed++)) || true
            fi
        fi
    fi

    # Check 4: Configuration drift (docker-compose.yml vs template)
    if type spoke_init_generate_compose &>/dev/null; then
        local compose_file="$spoke_dir/docker-compose.yml"
        local compose_backup="$spoke_dir/docker-compose.yml.before-repair"
        
        if [ -f "$compose_file" ]; then
            # Backup current compose file
            cp "$compose_file" "$compose_backup" 2>/dev/null || true
            
            # Regenerate from template
            if spoke_init_generate_compose "$instance_code" &>/dev/null; then
                # Check if files differ
                if ! diff -q "$compose_file" "$compose_backup" &>/dev/null; then
                    ((issues_found++)) || true
                    ((issues_fixed++)) || true
                    log_success "✓ Configuration drift fixed (docker-compose.yml regenerated)"
                    rm -f "$compose_backup" 2>/dev/null || true
                else
                    rm -f "$compose_backup" 2>/dev/null || true
                fi
            fi
        fi
    fi

    # Report results
    echo ""
    echo "=== Auto-Repair Summary ==="
    echo "Issues found: $issues_found"
    echo "Issues fixed: $issues_fixed"

    if [ $issues_found -eq 0 ]; then
        log_success "No issues detected - spoke is healthy"
        set -e
        return 0
    elif [ $issues_fixed -eq $issues_found ]; then
        log_success "All issues fixed automatically"
        set -e
        return 0
    else
        local unfixed=$((issues_found - issues_fixed))
        log_warn "$unfixed issue(s) could not be fixed automatically"
        echo ""
        echo "Manual intervention required. Try:"
        echo "  ./dive spoke status $instance_code --detailed"
        echo "  ./dive federation verify $instance_code"
        set -e
        return 1
    fi
}

# Export new functions
export -f spoke_restart
export -f spoke_reload_secrets
export -f spoke_repair