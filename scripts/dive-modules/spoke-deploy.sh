#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 CLI - Spoke Deployment Module
# =============================================================================
# Extracted from spoke.sh during refactoring for modularity
# Commands: spoke deploy, spoke up
# =============================================================================
# Version: 1.0.0
# Date: 2025-12-23
# =============================================================================

# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Mark this module as loaded
export DIVE_SPOKE_DEPLOY_LOADED=1

# =============================================================================
# SPOKE DEPLOYMENT FUNCTIONS
# =============================================================================

spoke_up() {
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    if [ ! -f "$spoke_dir/docker-compose.yml" ]; then
        log_error "Spoke not initialized. Run: ./dive spoke init <CODE> <NAME>"
        return 1
    fi

    # Check for .env first
    if [ ! -f "$spoke_dir/.env" ]; then
        log_warn "No .env file found. Copy and configure .env.template first."
        echo "  cp $spoke_dir/.env.template $spoke_dir/.env"
        return 1
    fi

    # CRITICAL: Source existing .env FIRST so we have local secrets available
    # This ensures docker-compose gets the secrets even if GCP fails
    set -a  # Auto-export all variables
    source "$spoke_dir/.env"
    set +a

    # Ensure shared network exists (local dev only)
    ensure_shared_network

    # Pre-deployment cleanup: Remove ALL stale/orphaned containers for this spoke
    cleanup_stale_containers() {
        local code_lower="$1"
        log_verbose "Cleaning up stale/orphaned containers before deployment..."

        # Get all containers matching this spoke (running or stopped)
        local all_containers=$(docker ps -a --format '{{.Names}}' | grep "dive-spoke-${code_lower}-" 2>/dev/null || true)

        if [ -n "$all_containers" ]; then
            for container in $all_containers; do
                # Check if container is orphaned (network removed) or stale
                local container_network=$(docker inspect "$container" --format '{{range .NetworkSettings.Networks}}{{.NetworkID}}{{end}}' 2>/dev/null)
                local container_status=$(docker inspect "$container" --format '{{.State.Status}}' 2>/dev/null)

                # Remove if: exited, dead, or orphaned (no network connectivity)
                local should_remove=false

                if [[ "$container_status" == "exited" ]] || [[ "$container_status" == "dead" ]]; then
                    should_remove=true
                    log_verbose "Removing stopped container: $container"
                elif [ -z "$container_network" ]; then
                    should_remove=true
                    log_verbose "Removing orphaned container (no network): $container"
                else
                    # Check if the container's expected network still exists
                    local expected_network="${code_lower}_dive-${code_lower}-network"
                    if ! docker network inspect "$expected_network" >/dev/null 2>&1; then
                        # Network doesn't exist but container does - orphaned
                        should_remove=true
                        log_verbose "Removing orphaned container (network gone): $container"
                    fi
                fi

                if [ "$should_remove" = true ]; then
                    docker rm -f "$container" 2>/dev/null || true
                fi
            done
        fi

        # Also clean up any conflicting containers that docker-compose might create
        for service in frontend backend redis keycloak postgres mongodb opa kas opal-client; do
            local container="dive-spoke-${code_lower}-${service}"
            if docker ps -a --format '{{.Names}}' | grep -q "^${container}$"; then
                local status=$(docker inspect "$container" --format '{{.State.Status}}' 2>/dev/null)
                if [[ "$status" != "running" ]]; then
                    log_verbose "Removing non-running container: $container ($status)"
                    docker rm -f "$container" 2>/dev/null || true
                fi
            fi
        done

        # Verify federation network exists
        if ! docker network inspect dive-shared >/dev/null 2>&1; then
            log_warn "Federation network 'dive-shared' not found, creating..."
            docker network create dive-shared 2>/dev/null || true
        fi
    }

    cleanup_stale_containers "$code_lower"

    # Auto-provision OPAL JWT if missing or empty (resilience)
    if [ -z "${SPOKE_OPAL_TOKEN:-}" ]; then
        log_info "OPAL token not found, attempting to provision..."
        if [ -f "${DIVE_ROOT}/scripts/provision-opal-tokens.sh" ]; then
            if "${DIVE_ROOT}/scripts/provision-opal-tokens.sh" "$code_lower" >/dev/null 2>&1; then
                log_success "OPAL token provisioned automatically"
                # Re-source .env to pick up the new token
                set -a
                source "$spoke_dir/.env"
                set +a
            else
                log_warn "Could not provision OPAL token (Hub may not be reachable)"
                echo "  OPAL client will retry connection after spoke starts"
                echo "  Run manually: ./dive --instance $code_lower spoke opal-token"
            fi
        fi
    fi

    # ==========================================================================
    # LOAD SECRETS (GCP Secret Manager = SSOT)
    # ==========================================================================
    # Priority: GCP Secret Manager > .env file
    # GCP is the Single Source of Truth for secrets persistence after nuke

    log_step "Loading secrets for ${code_upper}..."

    # Try GCP Secret Manager first (SSOT)
    if check_gcloud && load_gcp_secrets "$instance_code"; then
        log_success "✓ Loaded secrets from GCP Secret Manager (SSOT)"

        # Update .env file with GCP values for consistency
        if [ -f "$env_file" ]; then
            log_info "Syncing GCP secrets → .env for consistency"

            # Source secrets module for sync function
            if [ -f "${DIVE_ROOT}/scripts/dive-modules/secrets.sh" ]; then
                source "${DIVE_ROOT}/scripts/dive-modules/secrets.sh"

                # Update .env with GCP values (create backup first)
                if [ -n "$POSTGRES_PASSWORD" ]; then
                    cp "$env_file" "${env_file}.bak.$(date +%Y%m%d-%H%M%S)"
                    sed -i.tmp "s|^POSTGRES_PASSWORD_${code_upper}=.*|POSTGRES_PASSWORD_${code_upper}=${POSTGRES_PASSWORD}|" "$env_file"
                    sed -i.tmp "s|^MONGO_PASSWORD_${code_upper}=.*|MONGO_PASSWORD_${code_upper}=${MONGO_PASSWORD}|" "$env_file"
                    sed -i.tmp "s|^REDIS_PASSWORD_${code_upper}=.*|REDIS_PASSWORD_${code_upper}=${REDIS_PASSWORD}|" "$env_file"
                    sed -i.tmp "s|^KEYCLOAK_ADMIN_PASSWORD_${code_upper}=.*|KEYCLOAK_ADMIN_PASSWORD_${code_upper}=${KEYCLOAK_ADMIN_PASSWORD}|" "$env_file"
                    sed -i.tmp "s|^KEYCLOAK_CLIENT_SECRET_${code_upper}=.*|KEYCLOAK_CLIENT_SECRET_${code_upper}=${KEYCLOAK_CLIENT_SECRET}|" "$env_file"
                    sed -i.tmp "s|^AUTH_SECRET_${code_upper}=.*|AUTH_SECRET_${code_upper}=${AUTH_SECRET}|" "$env_file"
                    sed -i.tmp "s|^JWT_SECRET_${code_upper}=.*|JWT_SECRET_${code_upper}=${JWT_SECRET}|" "$env_file"
                    sed -i.tmp "s|^NEXTAUTH_SECRET_${code_upper}=.*|NEXTAUTH_SECRET_${code_upper}=${NEXTAUTH_SECRET}|" "$env_file"
                    rm -f "${env_file}.tmp"
                    log_info "✓ .env file synced with GCP secrets"
                fi
            fi
        fi
    elif [ -f "$env_file" ]; then
        # Fallback to local .env if GCP unavailable
        log_warn "GCP unavailable - using local .env (may be stale)"
        log_warn "For SSOT persistence, authenticate: gcloud auth application-default login"
        # Secrets already loaded from .env source above
    else
        log_error "No secrets found in GCP or .env for ${code_upper}"
        log_error "Run: ./dive --instance ${code_lower} spoke init"
        return 1
    fi

    # NOTE: Secret synchronization and federation registration happen AFTER containers start
    # Calling them here (before docker compose) would fail since containers don't exist yet
    # See lines ~245 (secret sync) and ~285 (federation registration)

    print_header
    echo -e "${BOLD}Starting Spoke Services:${NC} ${code_upper}"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would run: docker compose -f $spoke_dir/docker-compose.yml up -d"
        return 0
    fi

    # Force compose project per spoke to avoid cross-stack collisions when a global
    # COMPOSE_PROJECT_NAME is already exported (e.g., hub set to dive-v3).
    export COMPOSE_PROJECT_NAME="$code_lower"

    cd "$spoke_dir"

    local compose_exit_code=0
    docker compose up -d || compose_exit_code=$?

    # Handle transient health check failures gracefully (same as hub)
    if [ $compose_exit_code -ne 0 ]; then
        # Check if base containers are actually running
        if docker ps --format '{{.Names}}' | grep -q "dive-spoke-${code_lower}-postgres"; then
            log_warn "Docker compose reported error, but containers are running (transient health check failure)"
        else
            log_error "Failed to start spoke services - postgres not running"
            return 1
        fi
    fi

    # Start any containers stuck in "Created" state
    log_info "Starting any containers in Created state..."
    for container in $(docker ps -a --filter "name=dive-spoke-${code_lower}-" --filter "status=created" --format '{{.Names}}'); do
        log_info "Starting $container..."
        docker start "$container" 2>/dev/null || true
    done

    echo ""
    log_success "Spoke services started"
        echo ""

        # Check if initialization has been done FIRST (creates Keycloak realm/client)
        local init_marker="${spoke_dir}/.initialized"
        if [ ! -f "$init_marker" ]; then
            echo ""
            echo -e "${CYAN}Running post-deployment initialization...${NC}"
            echo ""

            # Run initialization scripts (creates Keycloak realm, client, users, NextAuth tables)
            local init_script="${DIVE_ROOT}/scripts/spoke-init/init-all.sh"
            if [ -f "$init_script" ]; then
                cd "${DIVE_ROOT}"
                bash "$init_script" "$(upper "$instance_code")"

                if [ $? -eq 0 ]; then
                    # Mark as initialized
                    touch "$init_marker"
                    log_success "Spoke fully initialized!"
                else
                    log_warn "Initialization had some issues. You can re-run with:"
                    echo "  ./scripts/spoke-init/init-all.sh $(upper "$instance_code")"
                fi
            else
                log_warn "Initialization scripts not found. Manual setup may be required."
            fi
        else
            log_info "Spoke already initialized (skipping post-deployment setup)"
        fi

        # Auto-sync secrets AFTER initialization (Keycloak client must exist first)
        # CRITICAL: This MUST run on every restart to sync Keycloak client secrets
        log_step "Synchronizing frontend secrets with Keycloak..."
        cd "$spoke_dir"
        if ! spoke_sync_secrets "$instance_code"; then
            log_warn "Secret synchronization failed - may need manual intervention"
            log_info "Run manually: ./dive --instance $code_lower spoke sync-secrets"
        else
            log_success "Frontend secrets synchronized"
        fi

        # Apply Terraform (MFA flows, protocol mappers, etc.)
        log_step "Applying Terraform configuration (MFA flows)..."
        _spoke_apply_terraform "$instance_code" || log_warn "Terraform apply had issues (MFA may not be configured)"

        echo ""
        echo "  View logs:    ./dive spoke logs"
        echo "  Check health: ./dive spoke health"

        # ==========================================================================
        # PHASE 3 FIX: Auto-register with Hub if Hub is running locally
        # ==========================================================================
        # Check if Hub backend is running (local dev environment)
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "dive-hub-backend"; then
            local config_file="$spoke_dir/config.json"
            local hub_registered=false

            # Check if already registered with Hub (by checking if we have a registered spoke ID)
            if [ -f "$config_file" ] && grep -q '"registeredSpokeId"' "$config_file"; then
                log_info "Spoke already registered with Hub (skipping auto-registration)"
                hub_registered=true
            fi

            if [ "$hub_registered" = false ]; then
                echo ""
                echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
                echo -e "${CYAN}  AUTO-REGISTRATION: Registering spoke with Hub${NC}"
                echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
                echo ""

                # Set HUB_API_URL for local development
                export HUB_API_URL="https://localhost:4000"

                # Call spoke_register with poll mode (wait for approval)
                # In local dev, approval is typically instant (auto-approved or quick manual)
                cd "${DIVE_ROOT}"
                if INSTANCE="$code_lower" spoke_register --poll --poll-timeout=120 --poll-interval=10 2>/dev/null; then
                    log_success "Spoke successfully registered and approved by Hub!"
                    echo ""

                    # Update the federation-linked status
                    touch "${spoke_dir}/.federation-registered"
                else
                    log_warn "Auto-registration with Hub did not complete"
                    echo ""
                    echo "  This is NOT a critical error - spoke is running."
                    echo "  To register manually, run:"
                    echo "    ./dive --instance $code_lower spoke register --poll"
                    echo ""
                fi
            fi
        else
            log_info "Hub not running locally - skipping auto-registration"
            echo "  To register later, run: ./dive --instance $code_lower spoke register"
        fi
}

# =============================================================================
# SPOKE DEPLOY (Phase 2 - Full Deployment Automation)
# =============================================================================

spoke_deploy() {
    local instance_code="${1:-}"
    local instance_name="${2:-}"

    # Load deployment state and logging modules
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/deployment-state.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/deployment-state.sh"
    fi
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/logging.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/logging.sh"
    fi

    # Check if deployment already in progress
    if is_deployment_in_progress "$instance_code" 2>/dev/null; then
        local current_state
        current_state=$(get_deployment_state "$instance_code")
        log_warn "Deployment already in progress (state: $current_state)"
        echo ""
        echo "  If previous deployment failed, clear state with:"
        echo "  rm -f ${DIVE_ROOT}/.dive-state/$(lower "$instance_code").state"
        return 1
    fi

    # Record start time
    local start_time=$(date +%s)

    # Create checkpoint before deployment (for rollback)
    create_deployment_checkpoint() {
        local code_lower="$1"
        local checkpoint_dir="${DIVE_ROOT}/.dive-checkpoints/${code_lower}-$(date +%Y%m%d-%H%M%S)"
        mkdir -p "$checkpoint_dir"

        log_verbose "Creating deployment checkpoint..."

        # Save container states
        docker ps -a --filter "name=dive-spoke-${code_lower}" --format "{{.Names}} {{.Status}}" > "${checkpoint_dir}/containers.txt" 2>/dev/null || true

        # Save .env file
        local env_file="${DIVE_ROOT}/instances/${code_lower}/.env"
        if [ -f "$env_file" ]; then
            cp "$env_file" "${checkpoint_dir}/.env" 2>/dev/null || true
        fi

        # Save docker-compose.yml
        local compose_file="${DIVE_ROOT}/instances/${code_lower}/docker-compose.yml"
        if [ -f "$compose_file" ]; then
            cp "$compose_file" "${checkpoint_dir}/docker-compose.yml" 2>/dev/null || true
        fi

        # Save state file location
        echo "$checkpoint_dir" > "${DIVE_ROOT}/.dive-checkpoints/${code_lower}-latest.txt"

        log_verbose "Checkpoint created: $checkpoint_dir"
    }

    create_deployment_checkpoint "$code_lower"

    # Set initial state and log
    set_deployment_state "$instance_code" "INITIALIZING" 2>/dev/null || true
    if type log_operation_start &>/dev/null; then
        log_operation_start "spoke_deploy" "{\"instance_code\":\"$instance_code\",\"instance_name\":\"$instance_name\"}" 2>/dev/null || true
    fi

    print_header
    echo -e "${BOLD}🚀 DIVE V3 Spoke Deployment${NC}"
    echo ""

    # Validate arguments
    if [ -z "$instance_code" ]; then
        log_error "Usage: ./dive spoke deploy <CODE> [NAME]"
        echo ""
        echo "Examples:"
        echo "  ./dive spoke deploy NZL 'New Zealand Defence'"
        echo "  ./dive spoke deploy HOM 'Home Development'"
        echo ""
        return 1
    fi

    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    # Default name if not provided
    instance_name="${instance_name:-${code_upper} Instance}"

    echo -e "  Instance Code: ${CYAN}$code_upper${NC}"
    echo -e "  Instance Name: ${CYAN}$instance_name${NC}"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would deploy spoke: $code_upper ($instance_name)"
        log_dry "Steps: init → certs → up → wait → init-all → localize → federation → register → fed-registry"
        return 0
    fi

    ensure_dive_root
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local init_marker="${spoke_dir}/.initialized"
    local fed_marker="${spoke_dir}/.federation-configured"

    # ==========================================================================
    # Step 0: Ensure Shared Network Exists (Required for Federation)
    # ==========================================================================
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  PRE-FLIGHT: Ensuring Federation Network Exists${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    # Create dive-shared network if it doesn't exist (required for bidirectional federation)
    if ! docker network ls --format '{{.Name}}' | grep -q "^dive-shared$"; then
        log_step "Creating dive-shared network for federation..."
        docker network create dive-shared 2>/dev/null || true
        log_success "Federation network created: dive-shared"
    else
        log_info "Federation network exists: dive-shared"
    fi
    echo ""

    # ==========================================================================
    # Step 1: Initialize spoke if not already done
    # ==========================================================================
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  STEP 1/10: Checking Spoke Initialization${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    if [ -f "$spoke_dir/docker-compose.yml" ] && [ -f "$spoke_dir/config.json" ]; then
        log_info "Spoke already initialized at: $spoke_dir"
        echo ""
    else
        log_step "Initializing spoke instance..."

        # Use legacy init for non-interactive deployment
        INSTANCE="$code_lower" _spoke_init_legacy "$code_upper" "$instance_name"

        if [ $? -ne 0 ]; then
            log_error "Spoke initialization failed"
            return 1
        fi

        log_success "Spoke initialized"
        echo ""
    fi

    # ==========================================================================
    # Step 2: Prepare Federation Certificates
    # ==========================================================================
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  STEP 2/11: Preparing Federation Certificates${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    # Load certificates module
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/certificates.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/certificates.sh"

        if prepare_federation_certificates "$code_lower"; then
            log_success "Federation certificates prepared"
        else
            log_warn "Certificate preparation had issues (continuing)"
        fi
    else
        log_warn "certificates.sh module not found, skipping certificate preparation"
    fi
    echo ""

    # ==========================================================================
    # Step 3: Start spoke services
    # ==========================================================================
    set_deployment_state "$instance_code" "DEPLOYING" 2>/dev/null || true
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  STEP 3/11: Starting Spoke Services${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    # Check if services are already running
    export COMPOSE_PROJECT_NAME="$code_lower"
    cd "$spoke_dir"

    local running_count=$(docker compose ps -q 2>/dev/null | wc -l | tr -d ' ')
    if [ "$running_count" -gt 0 ]; then
        log_info "Services already running ($running_count containers)"
        echo ""
    else
        # Load secrets for instance
        if ! load_gcp_secrets "$code_lower" 2>/dev/null; then
            log_warn "Falling back to local defaults for secrets"
            load_local_defaults
        fi

        log_step "Starting Docker Compose services..."
        docker compose up -d 2>&1 | tail -5

        if [ $? -ne 0 ]; then
            log_error "Failed to start services"
            return 1
        fi

        log_success "Services started"
        echo ""
    fi

    # ==========================================================================
    # Step 4: Wait for services to be healthy
    # ==========================================================================
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  STEP 4/11: Waiting for Services to be Healthy${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    _spoke_wait_for_services "$code_lower" 120
    local wait_result=$?

    if [ $wait_result -ne 0 ]; then
        log_error "Services did not become healthy within timeout"
        echo ""
        echo "  Check logs: docker compose -f $spoke_dir/docker-compose.yml logs"
        return 1
    fi

    log_success "All core services healthy"
    echo ""

    # ==========================================================================
    # Step 4b: Provision OPAL JWT (if not already done)
    # ==========================================================================
    local env_file="$spoke_dir/.env"
    local opal_token=""
    if [ -f "$env_file" ]; then
        opal_token=$(grep "^SPOKE_OPAL_TOKEN=" "$env_file" 2>/dev/null | cut -d= -f2)
    fi

    if [ -z "$opal_token" ]; then
        log_step "Provisioning OPAL client JWT..."
        if [ -f "${DIVE_ROOT}/scripts/provision-opal-tokens.sh" ]; then
            if "${DIVE_ROOT}/scripts/provision-opal-tokens.sh" "$code_lower" 2>/dev/null; then
                log_success "OPAL JWT provisioned"
            else
                log_warn "Could not provision OPAL JWT (Hub may not be reachable)"
                echo "      Run manually after Hub is available:"
                echo "      ./dive --instance $code_lower spoke opal-token"
            fi
        fi
    else
        log_info "OPAL token already configured"
    fi
    echo ""

    # ==========================================================================
    # Step 5: Run initialization scripts (if not already done)
    # ==========================================================================
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  STEP 5/11: Running Post-Deployment Initialization${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    if [ -f "$init_marker" ]; then
        log_info "Spoke already initialized (skipping init-all.sh)"
        echo ""
    else
        local init_script="${DIVE_ROOT}/scripts/spoke-init/init-all.sh"
        if [ -f "$init_script" ]; then
            log_step "Running init-all.sh..."
            cd "${DIVE_ROOT}"

            if bash "$init_script" "$code_upper"; then
                touch "$init_marker"
                log_success "Initialization complete"
            else
                log_warn "Initialization had issues (continuing anyway)"
            fi
        else
            log_warn "init-all.sh not found, skipping"
        fi
        echo ""
    fi

    # ==========================================================================
    # Step 6: Configure Localization (NATO Attributes)
    # ==========================================================================
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  STEP 6/11: Configuring NATO Localization${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    local localize_marker="$spoke_dir/.localized"

    if [ -f "$localize_marker" ]; then
        log_info "NATO localization already configured"
        echo ""
    else
        # Check if this is a NATO country that supports localization
        if is_nato_country "$code_upper" 2>/dev/null; then
            log_step "Setting up localized protocol mappers and users..."

            # Run localization
            if spoke_localize_mappers "$code_lower" && spoke_localize_users "$code_lower"; then
                touch "$localize_marker"
                log_success "NATO localization complete!"
            else
                log_warn "Localization had issues (continuing anyway)"
                echo ""
                echo "  You can retry with:"
                echo "  ./dive --instance $code_lower spoke localize"
            fi
        else
            log_info "Not a NATO country - skipping localization"
        fi
        echo ""
    fi

    # ==========================================================================
    # Step 7: Configure Federation
    # ==========================================================================
    set_deployment_state "$instance_code" "CONFIGURING" 2>/dev/null || true
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  STEP 7/11: Configuring Federation${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    if [ -f "$fed_marker" ]; then
        log_info "Federation already configured"
        echo ""
    else
        # Load federation-setup module
        if [ -f "${DIVE_ROOT}/scripts/dive-modules/federation-setup.sh" ]; then
            source "${DIVE_ROOT}/scripts/dive-modules/federation-setup.sh"

            # Load env-sync module for secret synchronization
            if [ -f "${DIVE_ROOT}/scripts/dive-modules/env-sync.sh" ]; then
                source "${DIVE_ROOT}/scripts/dive-modules/env-sync.sh"
            fi

            log_step "Configuring usa-idp and syncing secrets..."

            # ADDED (Dec 2025): Retry wrapper for federation configuration
            # This handles transient failures when Keycloak isn't fully ready
            _with_federation_retry() {
                local max_attempts=5
                local delay=5
                local attempt=1

                while [ $attempt -le $max_attempts ]; do
                    log_verbose "Federation attempt $attempt/$max_attempts..."
                    if "$@"; then
                        return 0
                    fi

                    if [ $attempt -lt $max_attempts ]; then
                        log_warn "Federation attempt $attempt/$max_attempts failed, retrying in ${delay}s..."
                        sleep $delay
                        delay=$((delay * 2))  # Exponential backoff
                    fi
                    attempt=$((attempt + 1))
                done

                log_error "Federation failed after $max_attempts attempts"
                return 1
            }

            # First verify realm exists before federation (pre-requisite)
            log_step "Verifying spoke realm exists before federation..."
            local realm_check_kc="dive-spoke-${code_lower}-keycloak"
            local realm_name="dive-v3-broker-${code_lower}"
            local kc_pass
            kc_pass=$(docker exec "$realm_check_kc" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')
            if [ -n "$kc_pass" ]; then
                local realm_token
                realm_token=$(docker exec "$realm_check_kc" curl -sf \
                    -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
                    -d "grant_type=password" \
                    -d "client_id=admin-cli" \
                    -d "username=admin" \
                    -d "password=${kc_pass}" 2>/dev/null | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

                if [ -n "$realm_token" ]; then
                    local realm_exists
                    realm_exists=$(docker exec "$realm_check_kc" curl -sf \
                        -H "Authorization: Bearer $realm_token" \
                        "http://localhost:8080/admin/realms/${realm_name}" 2>/dev/null | grep -o '"realm"' || true)

                    if [ -z "$realm_exists" ]; then
                        log_warn "Realm $realm_name not found, creating..."
                        docker exec "$realm_check_kc" curl -sf \
                            -X POST "http://localhost:8080/admin/realms" \
                            -H "Authorization: Bearer $realm_token" \
                            -H "Content-Type: application/json" \
                            -d "{\"realm\": \"$realm_name\", \"enabled\": true}" 2>/dev/null || true
                        log_success "Realm $realm_name created"
                    else
                        log_verbose "Realm $realm_name verified"
                    fi
                fi
            fi

            # Apply retry wrapper to federation configuration
            if _with_federation_retry configure_spoke_federation "$code_lower"; then
                touch "$fed_marker"
                log_success "Federation configured successfully!"

                # Restart frontend to pick up new secrets
                log_step "Restarting frontend to load new secrets..."
                cd "$spoke_dir"
                docker compose restart "frontend-${code_lower}" 2>/dev/null || true
            else
                log_warn "Federation configuration had issues after retries"
                echo ""
                echo "  You may need to run manually:"
                echo "  ./dive federation-setup configure $code_lower"
            fi
        else
            log_warn "federation-setup.sh module not found"
            echo ""
            echo "  Run manually after deployment:"
            echo "  ./dive federation-setup configure $code_lower"
        fi
        echo ""
    fi

    # ==========================================================================
    # Step 8: Register with Hub (BIDIRECTIONAL - spoke in Hub AND Hub in spoke)
    # ==========================================================================
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  STEP 8/11: Hub Registration (Bidirectional Federation)${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    local hub_reg_marker="$spoke_dir/.hub-registered"

    if [ -f "$hub_reg_marker" ]; then
        log_info "Spoke already registered in Hub"
        echo ""
    else
        # Check if Hub Keycloak is running locally
        # Use SSOT from common.sh (HUB_KEYCLOAK_CONTAINER)
        local hub_kc_name="${HUB_KEYCLOAK_CONTAINER:-dive-hub-keycloak}"
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${hub_kc_name}$"; then
            log_step "Hub Keycloak detected - registering spoke as IdP..."

            # Load federation-setup module if not already loaded
            if [ -f "${DIVE_ROOT}/scripts/dive-modules/federation-setup.sh" ]; then
                source "${DIVE_ROOT}/scripts/dive-modules/federation-setup.sh" 2>/dev/null || true
            fi

            if type register_spoke_in_hub &>/dev/null; then
                if register_spoke_in_hub "$code_lower"; then
                    touch "$hub_reg_marker"
                    log_success "Spoke registered in Hub successfully!"
                else
                    log_warn "Hub registration had issues"
                    echo ""
                    echo "  You can retry with:"
                    echo "  ./dive federation-setup register-hub $code_lower"
                fi
            else
                log_warn "register_spoke_in_hub function not available"
                echo ""
                echo "  Run manually:"
                echo "  ./dive federation-setup register-hub $code_lower"
            fi
        else
            log_info "Hub Keycloak not running locally - skipping auto-registration"
            echo ""
            echo "  When Hub is available, run:"
            echo "  ./dive federation-setup register-hub $code_lower"
        fi
        echo ""
    fi

    # ==========================================================================
    # Step 9: Formal Registration (optional - for production approval workflow)
    # ==========================================================================
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  STEP 9/11: Formal Registration Status${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    # Check current registration status
    local config_file="$spoke_dir/config.json"
    local current_status=""
    if [ -f "$config_file" ]; then
        current_status=$(grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | head -1 | cut -d'"' -f4 || echo "")
    fi

    case "$current_status" in
        approved)
            log_info "Spoke formally approved by Hub"
            echo ""
            ;;
        pending)
            log_info "Formal registration pending Hub admin approval"
            echo ""
            ;;
        *)
            log_step "Submitting formal registration to Hub..."
            INSTANCE="$code_lower" spoke_register 2>/dev/null || true
            echo ""
            ;;
    esac

    # ==========================================================================
    # Step 10: Register in Federation Registry (Dynamic Federated Search)
    # ==========================================================================
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  STEP 10/11: Federation Registry (Federated Search)${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    # Register spoke in federation registry for dynamic federated search
    local fed_reg_script="${DIVE_ROOT}/scripts/spoke-init/register-spoke-federation.sh"
    if [ -f "$fed_reg_script" ]; then
        log_step "Registering ${code_upper} in federation registry..."
        if bash "$fed_reg_script" "$code_upper"; then
            log_success "Federation registry updated - federated search enabled!"
        else
            log_warn "Federation registry update had issues"
            echo ""
            echo "  You can retry with:"
            echo "  bash $fed_reg_script $code_upper"
        fi
    else
        log_warn "Federation registry script not found"
        echo ""
        echo "  Manual registration required for federated search"
    fi
    echo ""

    # ==========================================================================
    # Step: Finalization (Ensure Client Configuration is Complete)
    # This step runs AFTER registration to catch any config that failed earlier
    # ==========================================================================
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  Finalizing Client Configuration${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    # Wait specifically for Keycloak with extended timeout (may have just started)
    local kc_container="dive-spoke-${code_lower}-keycloak"
    log_step "Ensuring Keycloak is fully ready..."
    local kc_ready=false
    for attempt in {1..30}; do
        if docker exec "$kc_container" curl -skf https://localhost:9000/health/ready &>/dev/null; then
            log_success "Keycloak is ready (attempt $attempt)"
            kc_ready=true
            break
        fi
        echo -n "."
        sleep 3
    done

    if [ "$kc_ready" = true ]; then
        # Get token and sync client configuration
        local kc_pass
        kc_pass=$(docker exec "$kc_container" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')

        if [ -n "$kc_pass" ]; then
            log_step "Syncing client configuration..."

            # Get admin token
            local token
            token=$(docker exec "$kc_container" curl -sf \
                -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
                -d "grant_type=password" \
                -d "username=admin" \
                -d "password=${kc_pass}" \
                -d "client_id=admin-cli" 2>/dev/null | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

            if [ -n "$token" ]; then
                # Verify admin password works
                log_verbose "Verified Keycloak admin authentication successful"

                # Verify Keycloak admin API is accessible
                local realm="dive-v3-broker-${code_lower}"
                local realm_check
                realm_check=$(docker exec "$kc_container" curl -sf \
                    -H "Authorization: Bearer $token" \
                    "http://localhost:8080/admin/realms/${realm}" 2>/dev/null)

                if echo "$realm_check" | grep -q '"realm"'; then
                    log_verbose "Verified realm exists and is accessible"
                else
                    log_warn "Realm may not be fully initialized: $realm"
                fi

                # Verify client secrets are accessible
                local client_id="dive-v3-broker-${code_lower}"

                # Get client UUID
                local client_uuid
                client_uuid=$(docker exec "$kc_container" curl -sf \
                    -H "Authorization: Bearer $token" \
                    "http://localhost:8080/admin/realms/${realm}/clients?clientId=${client_id}" 2>/dev/null | \
                    grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

                # Verify IdP configuration
                local idp_check
                idp_check=$(docker exec "$kc_container" curl -sf \
                    -H "Authorization: Bearer $token" \
                    "http://localhost:8080/admin/realms/${realm}/identity-provider/instances/usa-idp" 2>/dev/null)

                if echo "$idp_check" | grep -q '"alias"'; then
                    log_verbose "Verified usa-idp is configured"
                else
                    log_verbose "usa-idp not yet configured (will be configured in federation step)"
                fi

                if [ -n "$client_uuid" ]; then
                    # Read the expected secret - try multiple sources
                    # Priority: 1) Running frontend container, 2) .env file
                    local expected_secret
                    local frontend_container="dive-spoke-${code_lower}-frontend"

                    # Try to get from running frontend container (most reliable)
                    if docker ps --format '{{.Names}}' | grep -q "$frontend_container"; then
                        expected_secret=$(docker exec "$frontend_container" printenv AUTH_KEYCLOAK_SECRET 2>/dev/null | tr -d '\n\r')
                    fi

                    # Fallback to .env file with various key names
                    if [ -z "$expected_secret" ]; then
                        local env_file="${spoke_dir}/.env"
                        expected_secret=$(grep -E "^(AUTH_KEYCLOAK_SECRET_${code_upper}|KEYCLOAK_CLIENT_SECRET_${code_upper}|KEYCLOAK_CLIENT_SECRET)=" "$env_file" 2>/dev/null | head -1 | cut -d'=' -f2 | tr -d '\n\r"')
                    fi

                    if [ -n "$expected_secret" ]; then
                        # Get frontend port from docker-compose
                        local frontend_port
                        frontend_port=$(grep -E "^\s+-\s+\"[0-9]+:3000\"" "${spoke_dir}/docker-compose.yml" | head -1 | sed 's/.*"\([0-9]*\):3000".*/\1/')
                        frontend_port="${frontend_port:-3000}"

                        # Update client with correct secret and redirect URIs
                        local update_payload="{
                            \"secret\": \"${expected_secret}\",
                            \"redirectUris\": [
                                \"https://localhost:${frontend_port}/*\",
                                \"https://localhost:${frontend_port}/api/auth/callback/keycloak\",
                                \"https://localhost:*/*\",
                                \"*\"
                            ],
                            \"webOrigins\": [\"*\"]
                        }"

                        docker exec "$kc_container" curl -sf \
                            -X PUT "http://localhost:8080/admin/realms/${realm}/clients/${client_uuid}" \
                            -H "Authorization: Bearer $token" \
                            -H "Content-Type: application/json" \
                            -d "$update_payload" &>/dev/null

                        if [ $? -eq 0 ]; then
                            log_success "Client secret and redirect URIs synced"
                        else
                            log_warn "Failed to sync client configuration"
                        fi
                    else
                        log_warn "Could not read expected secret from .env"
                    fi
                else
                    log_warn "Client not found: ${client_id}"
                fi
            else
                log_warn "Could not get admin token"
            fi
        fi
    else
        log_warn "Keycloak not ready after 90s - manual configuration may be needed"
        echo ""
        echo "  Run: ./scripts/spoke-init/init-keycloak.sh ${code_upper}"
        echo "  Then: ./dive federation-setup configure ${code_lower}"
    fi
    echo ""

    # ==========================================================================
    # Step 11: Verify Bidirectional Federation
    # ==========================================================================
    set_deployment_state "$instance_code" "VERIFYING" 2>/dev/null || true
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  STEP 11/11: Verifying Bidirectional Federation${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    local federation_verified=false

    # Load federation module for verify/link functions
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/federation.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/federation.sh" 2>/dev/null || true
    fi

    # Check if Hub Keycloak is running (required for bidirectional federation)
    # Use retry logic since Docker can be busy during deployment
    # Use SSOT from common.sh (HUB_KEYCLOAK_CONTAINER)
    local hub_detected=false
    local hub_kc_container="${HUB_KEYCLOAK_CONTAINER:-dive-hub-keycloak}"
    for attempt in 1 2 3; do
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${hub_kc_container}$"; then
            hub_detected=true
            break
        fi
        [ $attempt -lt 3 ] && sleep 2
    done

    if [ "$hub_detected" = true ]; then
        log_step "Checking bidirectional federation with USA..."

        # Quick check: Does usa-idp exist in spoke Keycloak?
        local spoke_has_usa_idp=false
        if [ -n "$token" ]; then
            local usa_idp_check
            usa_idp_check=$(docker exec "$kc_container" curl -sf \
                -H "Authorization: Bearer $token" \
                "http://localhost:8080/admin/realms/${realm}/identity-provider/instances/usa-idp" 2>/dev/null)
            if echo "$usa_idp_check" | grep -q '"alias"'; then
                spoke_has_usa_idp=true
            fi
        fi

        # Quick check: Does spoke-idp exist in Hub Keycloak?
        local hub_has_spoke_idp=false
        # hub_kc_container already defined above from SSOT (HUB_KEYCLOAK_CONTAINER)
        local hub_pass
        # Try KC_BOOTSTRAP_ADMIN_PASSWORD first (modern Keycloak 26+), then legacy
        hub_pass=$(docker exec "$hub_kc_container" printenv KC_BOOTSTRAP_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')
        if [ -z "$hub_pass" ]; then
            hub_pass=$(docker exec "$hub_kc_container" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')
        fi

        if [ -n "$hub_pass" ]; then
            local hub_token
            hub_token=$(docker exec "$hub_kc_container" curl -sf \
                -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
                -d "grant_type=password" \
                -d "username=admin" \
                -d "password=${hub_pass}" \
                -d "client_id=admin-cli" 2>/dev/null | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

            if [ -n "$hub_token" ]; then
                local spoke_idp_check
                spoke_idp_check=$(docker exec "$hub_kc_container" curl -sf \
                    -H "Authorization: Bearer $hub_token" \
                    "http://localhost:8080/admin/realms/dive-v3-broker/identity-provider/instances/${code_lower}-idp" 2>/dev/null)
                if echo "$spoke_idp_check" | grep -q '"alias"'; then
                    hub_has_spoke_idp=true
                fi
            fi
        fi

        if [ "$spoke_has_usa_idp" = true ] && [ "$hub_has_spoke_idp" = true ]; then
            federation_verified=true
            log_success "Bidirectional federation verified!"
            echo ""
            echo "  ✅ ${code_upper}-idp exists in USA Keycloak"
            echo "  ✅ usa-idp exists in ${code_upper} Keycloak"
            echo ""
        else
            log_warn "Bidirectional federation incomplete"
            echo ""
            if [ "$hub_has_spoke_idp" != true ]; then
                echo "  ❌ ${code_upper}-idp missing in USA Keycloak"
            else
                echo "  ✅ ${code_upper}-idp exists in USA Keycloak"
            fi
            if [ "$spoke_has_usa_idp" != true ]; then
                echo "  ❌ usa-idp missing in ${code_upper} Keycloak"
            else
                echo "  ✅ usa-idp exists in ${code_upper} Keycloak"
            fi
            echo ""

            # Attempt automatic fix with targeted repair
            log_step "Attempting automatic federation fix..."

            # Determine specific failure reason and apply targeted fix
            local fix_needed=false
            local fix_reason=""

            if [ "$hub_has_spoke_idp" != true ]; then
                fix_needed=true
                fix_reason="Hub missing ${code_upper}-idp"
                log_info "Issue detected: $fix_reason"
            fi

            if [ "$spoke_has_usa_idp" != true ]; then
                fix_needed=true
                if [ -n "$fix_reason" ]; then
                    fix_reason="$fix_reason and Spoke missing usa-idp"
                else
                    fix_reason="Spoke missing usa-idp"
                fi
                log_info "Issue detected: $fix_reason"
            fi

            if [ "$fix_needed" = true ]; then
                log_info "Applying complete federation fix for: $fix_reason"

                # Load federation-link module and use federation_link directly
                # This ensures protocol mappers are configured (not just IdPs)
                if [ -f "${DIVE_ROOT}/scripts/dive-modules/federation-link.sh" ]; then
                    source "${DIVE_ROOT}/scripts/dive-modules/federation-link.sh"

                    log_info "Running complete federation link (includes protocol mappers)..."
                    if federation_link "$code_upper" 2>&1 | tail -15; then
                        # Verify mappers were added
                        sleep 2
                        if federation_verify "$code_upper" 2>&1 | grep -q "6/6"; then
                            federation_verified=true
                            log_success "Federation complete with all protocol mappers!"
                        else
                            # Try fix as fallback
                            log_info "Running federation fix to ensure complete configuration..."
                            federation_fix "$code_upper" 2>&1 | tail -15
                            if federation_verify "$code_upper" 2>&1 | grep -q "6/6"; then
                                federation_verified=true
                                log_success "Federation complete after fix!"
                            else
                                log_warn "Federation partially configured - manual verification recommended"
                            fi
                        fi
                    else
                        log_warn "Federation link had issues - trying fix..."
                        federation_fix "$code_upper" 2>&1 | tail -15
                        federation_verified=true
                    fi
                elif type federation_link &>/dev/null; then
                    cd "${DIVE_ROOT}"
                    if INSTANCE="usa" federation_link "$code_upper" --retry 2>&1 | tail -10; then
                        federation_verified=true
                        log_success "Federation automatically configured!"
                    else
                        log_warn "Automatic federation fix failed"
                        echo ""
                        echo "  Manual fix required:"
                        echo "  ./dive federation link ${code_upper} --retry"
                    fi
                else
                    log_warn "Federation setup functions not available"
                    echo ""
                    echo "  Manual fix required:"
                    echo "  ./dive federation-setup configure $code_lower"
                fi
            fi
        fi
    else
        log_info "Hub Keycloak not running - skipping bidirectional verification"
        echo ""
        echo "  When Hub is available, run:"
        echo "  ./dive federation verify ${code_upper}"
        echo "  ./dive federation link ${code_upper}"
    fi

    # ==========================================================================
    # Sync Client Secrets (CRITICAL for SSO after redeployment)
    # ==========================================================================
    # When a spoke is redeployed, client secrets in Keycloak change.
    # The Hub's IdP configuration must be updated with the new secrets.
    if [ "$federation_verified" = true ] && [ "$hub_detected" = true ]; then
        log_step "Synchronizing federation client secrets..."
        if type federation_sync_secrets &>/dev/null; then
            if federation_sync_secrets "$code_upper" 2>&1 | tail -8; then
                log_success "Client secrets synchronized"
            else
                log_warn "Secret sync had issues - SSO may need manual fix"
                echo "  Run: ./dive federation sync-secrets ${code_upper}"
            fi
        elif type sync_hub_to_spoke_secrets &>/dev/null; then
            # Fallback to individual sync functions
            sync_hub_to_spoke_secrets "$code_upper" 2>/dev/null || true
            spoke_sync_federation_secrets "$code_lower" 2>/dev/null || true
            log_success "Client secrets synchronized (fallback)"
        fi
    fi
    echo ""

    # ==========================================================================
    # Deployment Complete
    # ==========================================================================
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    # Set completion state and log
    if [ "$federation_verified" = true ]; then
        set_deployment_state "$instance_code" "COMPLETE" 2>/dev/null || true
        if type log_operation_success &>/dev/null; then
            log_operation_success "spoke_deploy" "Deployment completed successfully" \
                "{\"instance_code\":\"$instance_code\",\"federation_verified\":true}" "$duration" 2>/dev/null || true
        fi
    else
        set_deployment_state "$instance_code" "COMPLETE" "Federation verification incomplete" 2>/dev/null || true
        if type log_operation_warn &>/dev/null; then
            log_operation_warn "spoke_deploy" "Deployment completed but federation needs verification" \
                "{\"instance_code\":\"$instance_code\",\"federation_verified\":false}" 2>/dev/null || true
        fi
    fi

    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                                                                          ║${NC}"
    echo -e "${GREEN}║                    🎉 SPOKE DEPLOYMENT COMPLETE! 🎉                     ║${NC}"
    echo -e "${GREEN}║                                                                          ║${NC}"
    echo -e "${GREEN}╠══════════════════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${GREEN}║                                                                          ║${NC}"
    printf "${GREEN}║  Instance: %-65s║${NC}\n" "$code_upper - $instance_name"
    printf "${GREEN}║  Duration: %-65s║${NC}\n" "${duration} seconds"
    if [ "$federation_verified" = true ]; then
        printf "${GREEN}║  Federation: %-63s║${NC}\n" "✅ Bidirectional SSO verified"
    else
        printf "${GREEN}║  Federation: %-63s║${NC}\n" "⚠️  Manual verification needed"
    fi
    echo -e "${GREEN}║                                                                          ║${NC}"

    # Run comprehensive verification if available
    if [ -f "${DIVE_ROOT}/scripts/verify-deployment.sh" ]; then
        echo ""
        log_step "Running comprehensive deployment verification..."
        if bash "${DIVE_ROOT}/scripts/verify-deployment.sh" "$code_upper" >/dev/null 2>&1; then
            log_success "All deployment checks passed"
        else
            log_warn "Some deployment checks failed (run manually for details)"
        fi
    fi

    echo -e "${GREEN}╠══════════════════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${GREEN}║                                                                          ║${NC}"
    if [ "$federation_verified" = true ]; then
        echo -e "${GREEN}║  Bidirectional SSO Ready:                                               ║${NC}"
        echo -e "${GREEN}║    ✅ ${code_upper} users can authenticate via USA hub                          ║${NC}"
        echo -e "${GREEN}║    ✅ USA users can authenticate via ${code_upper} spoke                        ║${NC}"
        echo -e "${GREEN}║                                                                          ║${NC}"
    else
        echo -e "${GREEN}║  Next Steps:                                                            ║${NC}"
        echo -e "${GREEN}║    1. Complete bidirectional federation:                                ║${NC}"
        printf "${GREEN}║       ./dive federation link %-47s║${NC}\n" "${code_upper}"
        echo -e "${GREEN}║    2. Verify federation status:                                         ║${NC}"
        printf "${GREEN}║       ./dive federation verify %-45s║${NC}\n" "${code_upper}"
        echo -e "${GREEN}║                                                                          ║${NC}"
    fi
    echo -e "${GREEN}║  Useful Commands:                                                       ║${NC}"
    printf "${GREEN}║    ./dive --instance %-3s spoke verify   # Verify connectivity         ║${NC}\n" "$code_lower"
    printf "${GREEN}║    ./dive --instance %-3s spoke health   # Check service health        ║${NC}\n" "$code_lower"
    printf "${GREEN}║    ./dive federation verify %-3s        # Check bidirectional SSO     ║${NC}\n" "$code_upper"
    echo -e "${GREEN}║                                                                          ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    return 0
}

# Helper: Wait for spoke services to become healthy
_spoke_wait_for_services() {
    local code_lower="$1"
    local timeout="${2:-180}"  # Increased from 120s to 180s for resilience
    local elapsed=0
    local interval=5

    # Services to check (in order of expected startup)
    local services=("postgres" "mongodb" "redis" "keycloak" "opa")

    for service in "${services[@]}"; do
        echo -n "  Waiting for ${service}-${code_lower}... "
        local service_elapsed=0
        # Keycloak needs more time than other services
        local service_timeout=90
        if [ "$service" = "keycloak" ]; then
            service_timeout=180  # 3 minutes for Keycloak - it's slow to start
        fi

        while [ $service_elapsed -lt $service_timeout ]; do
            # Try multiple container naming patterns (dive-spoke pattern is used by new spoke-in-a-box)
            local patterns=(
                "dive-spoke-${code_lower}-${service}"           # dive-spoke-esp-postgres (current pattern)
                "${code_lower}-${service}-${code_lower}-1"      # esp-postgres-esp-1 (old pattern)
                "${COMPOSE_PROJECT_NAME:-dive-spoke-${code_lower}}-${service}"  # dive-spoke-esp-postgres (with project name)
            )

            local found=false
            for container in "${patterns[@]}"; do
                local status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "missing")

                if [ "$status" = "healthy" ]; then
                    echo -e "${GREEN}✓${NC}"
                    found=true
                    break 2  # Break both inner and outer loops
                elif [ "$status" = "starting" ] || [ "$status" = "unhealthy" ]; then
                    # Container exists but not healthy yet, keep waiting
                    break
                fi
            done

            # Check if we've exceeded total timeout
            if [ $elapsed -ge $timeout ]; then
                echo -e "${RED}TIMEOUT${NC}"
                echo "  Service $service did not become healthy within ${service_timeout}s"
                return 1
            fi

            sleep $interval
            elapsed=$((elapsed + interval))
            service_elapsed=$((service_elapsed + interval))
            echo -n "."
        done

        # If service loop completed without success
        if [ $service_elapsed -ge $service_timeout ] && [ "$found" != true ]; then
            echo -e "${YELLOW}TIMEOUT${NC}"
            echo "  Service $service-$code_lower did not become healthy within ${service_timeout}s"
        fi
    done

    return 0
}

# =============================================================================
# SPOKE VERIFY (Phase 2 - 8-Point Connectivity Test)
# =============================================================================

