#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Spoke Container Orchestration
# =============================================================================
# Manages container lifecycle with:
#   - Service dependency awareness
#   - Health check monitoring
#   - Graceful startup/shutdown
#   - Stale container cleanup
#
# Consolidates logic from spoke_deploy() lines 735-783, spoke_up(), and
# spoke-env-sync.sh spoke_up_enhanced()
# =============================================================================
# Version: 1.0.0
# Date: 2026-01-13
# =============================================================================

# Prevent multiple sourcing
if [ -n "${SPOKE_CONTAINERS_LOADED:-}" ]; then
    return 0
fi
export SPOKE_CONTAINERS_LOADED=1

# =============================================================================
# SERVICE DEPENDENCY GRAPH - DYNAMIC DISCOVERY
# =============================================================================
# Phase 1 Sprint 1.2 Enhancement: Services discovered dynamically from compose files
# No hardcoded arrays - parse from docker-compose.yml with dive.service.class labels
# =============================================================================

# Load compose parser utility for dynamic service discovery
if [ -f "${DIVE_ROOT}/scripts/dive-modules/utilities/compose-parser.sh" ]; then
    source "${DIVE_ROOT}/scripts/dive-modules/utilities/compose-parser.sh"
fi

##
# Get service order for a spoke instance (dynamically from compose file)
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   Space-separated list of services in dependency order
##
spoke_get_service_order() {
    local instance_code="$1"

    # Get services dynamically from compose file
    if type compose_get_spoke_services &>/dev/null; then
        compose_get_spoke_services "$instance_code"
    else
        # Fallback to legacy hardcoded list (should not reach here)
        echo "postgres mongodb redis keycloak opa backend frontend kas opal-client"
    fi
}

##
# Get service dependencies dynamically
#
# Arguments:
#   $1 - Instance code
#   $2 - Service name
#
# Returns:
#   Space-separated list of dependencies
##
spoke_get_service_deps() {
    local instance_code="$1"
    local service="$2"

    if type compose_get_spoke_dependencies &>/dev/null; then
        local deps=$(compose_get_spoke_dependencies "$instance_code" "$service")
        if [ "$deps" = "none" ]; then
            echo ""
        else
            # Convert comma-separated to space-separated
            echo "$deps" | tr ',' ' '
        fi
    else
        # Fallback to legacy hardcoded dependencies
        case "$service" in
            postgres|mongodb|redis|opa) echo "" ;;
            keycloak) echo "postgres" ;;
            backend) echo "postgres mongodb redis keycloak opa" ;;
            frontend) echo "backend" ;;
            kas) echo "mongodb backend" ;;
            opal-client) echo "backend" ;;
            *) echo "" ;;
        esac
    fi
}

# Service startup timeouts (seconds)
# Note: Bash associative arrays don't export well, so we use a function
spoke_get_service_timeout() {
    local service="$1"
    case "$service" in
        postgres) echo 60 ;;
        mongodb) echo 60 ;;
        redis) echo 30 ;;
        keycloak) echo 180 ;;
        opa) echo 30 ;;
        backend) echo 120 ;;
        frontend) echo 60 ;;
        kas) echo 60 ;;
        opal-client) echo 30 ;;
        *) echo 60 ;;
    esac
}

# For backward compatibility, also declare the associative array
if declare -A SPOKE_SERVICE_TIMEOUTS 2>/dev/null; then
    SPOKE_SERVICE_TIMEOUTS=(
        ["postgres"]=60
        ["mongodb"]=60
        ["redis"]=30
        ["keycloak"]=180
        ["opa"]=30
        ["backend"]=120
        ["frontend"]=60
        ["kas"]=60
        ["opal-client"]=30
    )
fi

# =============================================================================
# MAIN CONTAINER ORCHESTRATION
# =============================================================================

##
# Start all spoke containers with dependency awareness
#
# Arguments:
#   $1 - Instance code
#   $2 - Force rebuild (true/false)
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_containers_start() {
    local instance_code="$1"
    local force_rebuild="${2:-false}"

    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    log_step "Starting containers for $code_upper"

    # Verify compose file exists
    if [ ! -f "$spoke_dir/docker-compose.yml" ]; then
        orch_record_error "$SPOKE_ERROR_COMPOSE_GENERATE" "$ORCH_SEVERITY_CRITICAL" \
            "Docker compose file not found" "containers" \
            "$(spoke_error_get_remediation $SPOKE_ERROR_COMPOSE_GENERATE $instance_code)"
        return 1
    fi

    # Set compose project name
    export COMPOSE_PROJECT_NAME="dive-spoke-${code_lower}"
    cd "$spoke_dir"

    # Source .env file
    if [ -f "$spoke_dir/.env" ]; then
        set -a
        source "$spoke_dir/.env"
        set +a
    fi

    # Check if parallel tier-based startup is available
    if type orch_start_services_tiered &>/dev/null && [ "$force_rebuild" != "true" ]; then
        log_info "Using optimized parallel tier-based startup (30% faster)"

        # Change back to DIVE_ROOT for module execution
        cd "${DIVE_ROOT}"

        # Use tiered parallel startup
        if orch_start_services_tiered "$instance_code" "docker-compose.yml"; then
            log_success "All services started with parallel tier approach"
            return 0
        else
            log_warn "Parallel tier startup failed, falling back to traditional approach"
            cd "$spoke_dir"
        fi
    fi

    # BEST PRACTICE STAGED STARTUP APPROACH
    # Start containers in dependency order to ensure proper initialization
    # Stage 1: Infrastructure (postgres, redis, mongodb, opa)
    # Stage 2: OPAL Client (depends on infrastructure)
    # Stage 3: Keycloak (depends on postgres)
    # Stage 4: Applications (backend, kas, frontend - depend on Keycloak and OPAL)

    log_info "Using best practice staged container startup"

    local compose_cmd="docker compose"
    local compose_args_base="up -d"

    # Add --env-file flag if .env file exists (required for variable substitution)
    if [ -f "$spoke_dir/.env" ]; then
        compose_cmd="$compose_cmd --env-file .env"
        log_verbose "Using environment file: .env"
    fi

    if [ "$force_rebuild" = "true" ]; then
        compose_args_base="$compose_args_base --build --force-recreate"
    fi

    # =============================================================================
    # PERFORMANCE OPTIMIZATION: Pre-pull Docker images in parallel
    # =============================================================================
    # Pull images before starting containers to:
    # 1. Avoid blocking container startup on image downloads
    # 2. Enable parallel image pulls across all services
    # 3. Reduce overall deployment time by 30-60 seconds
    # =============================================================================
    log_info "Pre-pulling Docker images in parallel..."
    local pull_start=$(date +%s)

    # Start pull in background to continue with preparation
    if $compose_cmd pull --quiet --ignore-pull-failures 2>/dev/null & then
        local pull_pid=$!
        log_verbose "Image pull started (PID: $pull_pid)"

        # Wait for pull with timeout
        local pull_timeout=120
        local pull_waited=0
        while kill -0 $pull_pid 2>/dev/null && [ $pull_waited -lt $pull_timeout ]; do
            sleep 2
            pull_waited=$((pull_waited + 2))
        done

        # Check if pull completed
        if kill -0 $pull_pid 2>/dev/null; then
            log_verbose "Image pull still running after ${pull_timeout}s, continuing anyway"
            # Don't kill - let it finish in background
        else
            wait $pull_pid 2>/dev/null
            local pull_end=$(date +%s)
            local pull_duration=$((pull_end - pull_start))
            log_success "✓ Images pre-pulled in ${pull_duration}s"
        fi
    else
        log_verbose "Image pull skipped (images likely cached)"
    fi

    # Stage 1: Start core infrastructure (postgres, redis, mongodb, opa)
    log_info "Stage 1: Starting core infrastructure containers..."
    local infra_services="postgres-${code_lower} redis-${code_lower} mongodb-${code_lower} opa-${code_lower}"
    local compose_args="$compose_args_base $infra_services"

    log_verbose "Infrastructure services: $infra_services"
    log_verbose "Running: $compose_cmd $compose_args"

    # Cross-platform timeout implementation (macOS doesn't have GNU timeout)
    if command -v timeout &>/dev/null; then
        # Linux: use GNU timeout
        if ! timeout 60 $compose_cmd $compose_args; then
            log_error "Failed to start core infrastructure containers (timeout or error)"
            orch_record_error "$SPOKE_ERROR_COMPOSE_UP" "$ORCH_SEVERITY_CRITICAL" \
                "Infrastructure startup failed" "containers" \
                "$(spoke_error_get_remediation $SPOKE_ERROR_COMPOSE_UP $instance_code)"
            return 1
        fi
    elif command -v gtimeout &>/dev/null; then
        # macOS with GNU coreutils installed via Homebrew
        if ! gtimeout 60 $compose_cmd $compose_args; then
            log_error "Failed to start core infrastructure containers (timeout or error)"
            orch_record_error "$SPOKE_ERROR_COMPOSE_UP" "$ORCH_SEVERITY_CRITICAL" \
                "Infrastructure startup failed" "containers" \
                "$(spoke_error_get_remediation $SPOKE_ERROR_COMPOSE_UP $instance_code)"
            return 1
        fi
    else
        # macOS without GNU coreutils: use background process with kill
        $compose_cmd $compose_args &
        local compose_pid=$!
        local waited=0
        while [ $waited -lt 60 ]; do
            if ! kill -0 $compose_pid 2>/dev/null; then
                # Process finished
                wait $compose_pid
                local exit_code=$?
                if [ $exit_code -ne 0 ]; then
                    log_error "Failed to start core infrastructure containers (exit code: $exit_code)"
                    orch_record_error "$SPOKE_ERROR_COMPOSE_UP" "$ORCH_SEVERITY_CRITICAL" \
                        "Infrastructure startup failed" "containers" \
                        "$(spoke_error_get_remediation $SPOKE_ERROR_COMPOSE_UP $instance_code)"
                    return 1
                fi
                break
            fi
            sleep 1
            waited=$((waited + 1))
        done

        # Check if still running (timeout)
        if kill -0 $compose_pid 2>/dev/null; then
            log_error "Container startup timed out after 60s"
            kill $compose_pid 2>/dev/null || true
            orch_record_error "$SPOKE_ERROR_COMPOSE_UP" "$ORCH_SEVERITY_CRITICAL" \
                "Infrastructure startup timeout" "containers" \
                "$(spoke_error_get_remediation $SPOKE_ERROR_COMPOSE_UP $instance_code)"
            return 1
        fi
    fi

    # Wait for core infrastructure to be running
    # CRITICAL FIX (2026-01-27): Don't wait for 'healthy' status during start_period
    # Docker healthchecks take time to initialize (start_period + intervals)
    # Instead, wait for containers to be Up and running
    log_info "Waiting for core infrastructure to be running..."
    local max_wait=30  # Reduced from 120s - just need containers to start
    local waited=0

    while [ $waited -lt $max_wait ]; do
        # Container names are: dive-spoke-fra-postgres, dive-spoke-fra-redis, etc.
        local running_count=$(docker ps --filter "name=dive-spoke-${code_lower}" --format '{{.Names}}' | grep -E '\-(postgres|redis|mongodb|opa)$' | wc -l | tr -d ' ')

        if [ "$running_count" -ge 4 ]; then
            log_info "Core infrastructure running (${running_count}/4 services) after ${waited}s"
            # Give containers 2 more seconds to stabilize before proceeding
            sleep 2
            break
        fi

        log_verbose "Infrastructure startup: ${running_count}/4 services running, waiting..."
        sleep 2
        waited=$((waited + 2))
    done

    if [ $waited -ge $max_wait ]; then
        log_error "Core infrastructure failed to start within ${max_wait}s"
        return 1
    fi

    # Stage 2: Start OPAL Client (depends on infrastructure)
    log_verbose "Stage 2: Starting OPAL Client..."
    compose_args="$compose_args_base opal-client-${code_lower}"

    log_verbose "Running: $compose_cmd $compose_args"
    if ! $compose_cmd $compose_args >/dev/null 2>&1; then
        log_error "Failed to start OPAL Client"
        orch_record_error "$SPOKE_ERROR_COMPOSE_UP" "$ORCH_SEVERITY_CRITICAL" \
            "OPAL Client startup failed" "containers" \
            "$(spoke_error_get_remediation $SPOKE_ERROR_COMPOSE_UP $instance_code)"
        return 1
    fi

    # Wait for OPAL Client to be healthy (may take longer due to policy sync)
    log_verbose "Waiting for OPAL Client to be healthy..."
    if ! spoke_containers_wait_for_services "$instance_code" "opal-client-${code_lower}" 120; then
        log_warn "OPAL Client did not become healthy - deployment will continue but policy enforcement may not work"
        log_warn "Check OPAL logs: ./dive spoke logs FRA opal-client"
        # Non-blocking: OPAL is important but spoke can function without it initially
    fi

    # Stage 3: Start Keycloak (depends on postgres)
    log_verbose "Stage 3: Starting Keycloak..."
    compose_args="$compose_args_base keycloak-${code_lower}"

    log_verbose "Running: $compose_cmd $compose_args"
    if ! $compose_cmd $compose_args >/dev/null 2>&1; then
        log_error "Failed to start Keycloak"
        orch_record_error "$SPOKE_ERROR_COMPOSE_UP" "$ORCH_SEVERITY_CRITICAL" \
            "Keycloak startup failed" "containers" \
            "$(spoke_error_get_remediation $SPOKE_ERROR_COMPOSE_UP $instance_code)"
        return 1
    fi

    # Wait for Keycloak to be running (not necessarily healthy - realm created later)
    log_verbose "Waiting for Keycloak to be running..."
    local max_wait=60
    local wait_count=0
    while [ $wait_count -lt $max_wait ]; do
        if docker ps --filter "name=dive-spoke-${code_lower}-keycloak" --format '{{.Names}}' | grep -q .; then
            log_verbose "Keycloak container is running"
            break
        fi
        sleep 2
        wait_count=$((wait_count + 2))
    done

    if [ $wait_count -ge $max_wait ]; then
        log_error "Keycloak failed to start within ${max_wait}s"
        return 1
    fi

    # Stage 4: Start application containers (backend, kas, frontend)
    log_verbose "Stage 4: Starting application containers..."
    local app_services="backend-${code_lower} kas-${code_lower} frontend-${code_lower}"
    compose_args="$compose_args_base $app_services"

    log_verbose "Running: $compose_cmd $compose_args"
    local compose_output
    local compose_exit_code=0

    compose_output=$($compose_cmd $compose_args 2>&1) || compose_exit_code=$?

    if [ $compose_exit_code -ne 0 ]; then
        # Check if containers started despite errors
        if docker ps --format '{{.Names}}' | grep -q "dive-spoke-${code_lower}-backend"; then
            log_warn "Application containers started despite compose errors (health checks may be pending)"
        else
            log_error "Failed to start application containers"
            echo "$compose_output" | tail -10
            orch_record_error "$SPOKE_ERROR_COMPOSE_UP" "$ORCH_SEVERITY_CRITICAL" \
                "Application startup failed" "containers" \
                "$(spoke_error_get_remediation $SPOKE_ERROR_COMPOSE_UP $instance_code)"
            return 1
        fi
    fi

    log_success "All containers started successfully in staged approach"

    # Start any containers stuck in "Created" state
    spoke_containers_start_created "$instance_code"

    log_success "Containers started"
    return 0
}

##
# Start containers that are in "Created" state
##
spoke_containers_start_created() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    local created_containers
    created_containers=$(docker ps -a --filter "name=dive-spoke-${code_lower}-" --filter "status=created" --format '{{.Names}}')

    if [ -n "$created_containers" ]; then
        log_verbose "Starting containers in Created state..."
        for container in $created_containers; do
            log_verbose "Starting $container"
            if ! docker start "$container" 2>/dev/null; then
                log_verbose "Could not start $container (may already be running)"
            fi
        done
    fi
}

##
# Stop all spoke containers
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Success
##
spoke_containers_stop() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    log_step "Stopping containers for $(upper "$instance_code")"

    export COMPOSE_PROJECT_NAME="dive-spoke-${code_lower}"

    if [ -f "$spoke_dir/docker-compose.yml" ]; then
        cd "$spoke_dir"
        if ! docker compose down 2>/dev/null; then
            log_verbose "docker compose down failed (containers may not be running)"
        fi
    else
        # Fallback: stop containers by name pattern
        local containers
        containers=$(docker ps -q --filter "name=dive-spoke-${code_lower}-" 2>/dev/null)
        if [ -n "$containers" ]; then
            if ! docker stop $containers 2>/dev/null; then
                log_verbose "Some containers could not be stopped"
            fi
        fi
    fi

    log_success "Containers stopped"
    return 0
}

##
# Clean up containers and volumes
#
# Arguments:
#   $1 - Instance code
#   $2 - Remove volumes (true/false/databases-only)
#
# Returns:
#   0 - Success
##
spoke_containers_clean() {
    local instance_code="$1"
    local remove_volumes="${2:-false}"

    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    log_step "Cleaning containers for $(upper "$instance_code")"

    export COMPOSE_PROJECT_NAME="dive-spoke-${code_lower}"

    if [ -f "$spoke_dir/docker-compose.yml" ]; then
        cd "$spoke_dir"
        if [ "$remove_volumes" = "true" ]; then
            if ! docker compose down -v --remove-orphans 2>/dev/null; then
                log_verbose "docker compose down with volumes failed"
            fi
        elif [ "$remove_volumes" = "databases-only" ]; then
            # Stop containers but only remove database volumes
            if ! docker compose down --remove-orphans 2>/dev/null; then
                log_verbose "docker compose down failed"
            fi
            spoke_containers_clean_database_volumes "$instance_code"
        else
            if ! docker compose down --remove-orphans 2>/dev/null; then
                log_verbose "docker compose down failed"
            fi
        fi
    fi

    # Also remove any orphaned containers
    local orphaned
    orphaned=$(docker ps -aq --filter "name=dive-spoke-${code_lower}-" 2>/dev/null)
    if [ -n "$orphaned" ]; then
        if ! docker rm -f $orphaned 2>/dev/null; then
            log_verbose "Some orphaned containers could not be removed"
        fi
    fi

    log_success "Containers cleaned"
    return 0
}

##
# Clean only database volumes (postgres, mongodb, redis)
# Used when secrets change to prevent password mismatch
#
# Arguments:
#   $1 - Instance code
##
spoke_containers_clean_database_volumes() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")
    local project_name="dive-spoke-${code_lower}"

    log_verbose "Cleaning database volumes for $instance_code"

    # Database volumes to clean
    local db_volumes=(
        "${project_name}_postgres_data"
        "${project_name}_mongodb_data"
        "${project_name}_mongodb_config"
        "${project_name}_redis_data"
    )

    for volume in "${db_volumes[@]}"; do
        if docker volume ls --format '{{.Name}}' | grep -q "^${volume}$"; then
            log_verbose "Removing database volume: $volume"
            if ! docker volume rm "$volume" 2>/dev/null; then
                log_verbose "Could not remove volume $volume (may be in use)"
            fi
        fi
    done

    log_verbose "Database volumes cleaned"
}

# =============================================================================
# HEALTH CHECK MONITORING
# =============================================================================

##
# Wait for all services to become healthy
#
# Arguments:
#   $1 - Instance code
#   $2 - Global timeout (seconds, default 300)
#
# Returns:
#   0 - All services healthy
#   1 - Timeout or failure
##
spoke_containers_wait_for_healthy() {
    local instance_code="$1"
    local global_timeout="${2:-300}"

    local code_lower=$(lower "$instance_code")
    local start_time=$(date +%s)

    log_step "Waiting for services to become healthy..."

    # Get services dynamically from compose file
    local service_order=($(spoke_get_service_order "$instance_code"))

    # Wait for each service in order
    for service in "${service_order[@]}"; do
        local container="dive-spoke-${code_lower}-${service}"
        local timeout=$(spoke_get_service_timeout "$service")

        # Check global timeout
        local elapsed=$(($(date +%s) - start_time))
        if [ $elapsed -ge $global_timeout ]; then
            log_error "Global timeout reached after ${elapsed}s"
            orch_record_error "$SPOKE_ERROR_SERVICE_TIMEOUT" "$ORCH_SEVERITY_CRITICAL" \
                "Global timeout waiting for services" "containers" \
                "$(spoke_error_get_remediation $SPOKE_ERROR_SERVICE_TIMEOUT $instance_code)"
            return 1
        fi

        # Wait for this service
        if ! spoke_containers_wait_for_service "$container" "$timeout"; then
            orch_record_error "$SPOKE_ERROR_CONTAINER_UNHEALTHY" "$ORCH_SEVERITY_HIGH" \
                "Service $service failed health check" "containers" \
                "$(spoke_error_get_remediation $SPOKE_ERROR_CONTAINER_UNHEALTHY $instance_code)"
            return 1
        fi
    done

    local total_time=$(($(date +%s) - start_time))
    log_success "All services healthy (${total_time}s)"
    return 0
}

##
# Wait for a single service container to become healthy
#
# Arguments:
#   $1 - Container name
#   $2 - Timeout (seconds)
#
# Returns:
#   0 - Healthy
#   1 - Timeout or unhealthy
##
spoke_containers_wait_for_service() {
    local container="$1"
    local timeout="$2"

    local elapsed=0
    local interval=3

    echo -n "  Waiting for $container... "

    while [ $elapsed -lt $timeout ]; do
        # Check if container exists
        if ! docker ps -a --format '{{.Names}}' | grep -q "^${container}$"; then
            # Container doesn't exist - might not be in this compose file
            echo -e "${YELLOW}skipped (not found)${NC}"
            return 0
        fi

        # Check health status
        local status
        status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "no-healthcheck")

        case "$status" in
            healthy)
                echo -e "${GREEN}✓${NC}"
                return 0
                ;;
            no-healthcheck)
                # No health check - check if running
                local running
                running=$(docker inspect --format='{{.State.Running}}' "$container" 2>/dev/null || echo "false")
                if [ "$running" = "true" ]; then
                    echo -e "${GREEN}✓ (running)${NC}"
                    return 0
                fi
                ;;
            starting|unhealthy)
                # Still starting or unhealthy, continue waiting
                ;;
            *)
                # Unknown status
                ;;
        esac

        sleep $interval
        elapsed=$((elapsed + interval))
        echo -n "."
    done

    echo -e "${RED}TIMEOUT${NC}"
    log_warn "Container $container did not become healthy within ${timeout}s"
    return 1
}

##
# Check if dependencies are healthy
#
# Arguments:
#   $1 - Service name
#   $2 - Instance code (lowercase)
#
# Returns:
#   0 - All dependencies healthy
#   1 - Some dependencies not healthy
##
spoke_containers_check_dependencies() {
    local service="$1"
    local code_lower="$2"

    local deps="${SPOKE_SERVICE_DEPS[$service]}"

    if [ -z "$deps" ]; then
        return 0
    fi

    for dep in $deps; do
        local container="dive-spoke-${code_lower}-${dep}"
        local status
        status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "")

        if [ "$status" != "healthy" ]; then
            # Check if running without health check
            local running
            running=$(docker inspect --format='{{.State.Running}}' "$container" 2>/dev/null || echo "false")
            if [ "$running" != "true" ]; then
                log_verbose "Dependency $dep not ready for $service"
                return 1
            fi
        fi
    done

    return 0
}

# =============================================================================
# CONTAINER INFORMATION
# =============================================================================

##
# Get container status summary
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   JSON status object
##
spoke_containers_status() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    local running=0
    local unhealthy=0
    local stopped=0
    local total=0

    # Get services dynamically from compose file
    local service_order=($(spoke_get_service_order "$instance_code"))

    for service in "${service_order[@]}"; do
        local container="dive-spoke-${code_lower}-${service}"

        if docker ps -a --format '{{.Names}}' | grep -q "^${container}$"; then
            total=$((total + 1))

            local status
            status=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null || echo "unknown")

            case "$status" in
                running)
                    running=$((running + 1))
                    # Check health if available
                    local health
                    health=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "")
                    if [ "$health" = "unhealthy" ]; then
                        unhealthy=$((unhealthy + 1))
                    fi
                    ;;
                exited|dead)
                    stopped=$((stopped + 1))
                    ;;
            esac
        fi
    done

    echo "{\"running\":$running,\"unhealthy\":$unhealthy,\"stopped\":$stopped,\"total\":$total}"
}

##
# List all containers for a spoke instance
#
# Arguments:
#   $1 - Instance code
##
spoke_containers_list() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    echo ""
    echo "Containers for $(upper "$instance_code"):"
    echo "============================================"

    docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" \
        --filter "name=dive-spoke-${code_lower}-" 2>/dev/null || echo "No containers found"

    echo ""
}

##
# Get container logs
#
# Arguments:
#   $1 - Instance code
#   $2 - Service name (optional, all if empty)
#   $3 - Tail lines (optional, default 50)
##
spoke_containers_logs() {
    local instance_code="$1"
    local service="${2:-}"
    local tail_lines="${3:-50}"

    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    export COMPOSE_PROJECT_NAME="dive-spoke-${code_lower}"

    if [ -f "$spoke_dir/docker-compose.yml" ]; then
        cd "$spoke_dir"
        if [ -n "$service" ]; then
            docker compose logs --tail="$tail_lines" "${service}-${code_lower}" 2>/dev/null || \
                docker compose logs --tail="$tail_lines" "$service" 2>/dev/null
        else
            docker compose logs --tail="$tail_lines"
        fi
    else
        if [ -n "$service" ]; then
            docker logs --tail="$tail_lines" "dive-spoke-${code_lower}-${service}" 2>/dev/null
        else
            # Get services dynamically from compose file
            local service_order=($(spoke_get_service_order "$instance_code"))

            for svc in "${service_order[@]}"; do
                echo "=== $svc ==="
                docker logs --tail=20 "dive-spoke-${code_lower}-${svc}" 2>/dev/null || echo "No logs"
                echo ""
            done
        fi
    fi
}

# =============================================================================
# RESTART AND RECREATION
# =============================================================================

##
# Restart specific service
#
# Arguments:
#   $1 - Instance code
#   $2 - Service name
##
spoke_containers_restart_service() {
    local instance_code="$1"
    local service="$2"

    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    log_step "Restarting $service"

    export COMPOSE_PROJECT_NAME="dive-spoke-${code_lower}"
    cd "$spoke_dir"

    docker compose restart "${service}-${code_lower}" 2>/dev/null || \
        docker compose restart "$service" 2>/dev/null || \
        docker restart "dive-spoke-${code_lower}-${service}" 2>/dev/null

    log_success "$service restarted"
}

##
# Force recreation of all containers
#
# Arguments:
#   $1 - Instance code
##
spoke_containers_force_recreate() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    log_step "Force recreating containers for $(upper "$instance_code")"

    export COMPOSE_PROJECT_NAME="dive-spoke-${code_lower}"
    cd "$spoke_dir"

    # Stop existing
    if ! docker compose down 2>/dev/null; then
        log_verbose "docker compose down failed (containers may not be running)"
    fi

    # Remove any hash tracking
    rm -f "$spoke_dir/.compose.hash"

    # Start fresh with force recreate
    docker compose up -d --force-recreate 2>&1 | tail -5

    log_success "Containers recreated"
}

##
# Wait for specific services to become healthy
#
# Arguments:
#   $1 - Instance code
#   $2 - Space-separated list of service names (without instance prefix)
#   $3 - Timeout in seconds (default: 60)
#
# Returns:
#   0 - All services healthy
#   1 - Timeout or failure
##
spoke_containers_wait_for_services() {
    local instance_code="$1"
    local services="$2"
    local timeout="${3:-60}"
    local code_lower=$(lower "$instance_code")

    log_verbose "Waiting up to ${timeout}s for services: $services"

    local start_time=$(date +%s)
    while [ $(($(date +%s) - start_time)) -lt $timeout ]; do
        local all_healthy=true

        for service in $services; do
            # Service is in format "service-instance", extract base service name
            local service_name="${service%%-*}"  # Get part before first dash
            # Check if service is running and healthy
            if docker ps --filter "name=dive-spoke-${code_lower}-${service_name}" --filter "health=healthy" --format '{{.Names}}' | grep -q .; then
                log_verbose "✓ $service is healthy"
            else
                log_verbose "⏳ $service not yet healthy"
                all_healthy=false
                break
            fi
        done

        if [ "$all_healthy" = true ]; then
            log_verbose "All services are healthy"
            return 0
        fi

        sleep 2
    done

    log_warn "Services did not become healthy within ${timeout}s: $services"
    return 1
}
