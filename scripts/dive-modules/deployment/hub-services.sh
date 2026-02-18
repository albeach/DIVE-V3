# =============================================================================
# DIVE V3 - Hub Services & Utilities
# =============================================================================
# Sourced by deployment/hub.sh — do not execute directly.
#
# Parallel startup, health checks, orchestration DB, Keycloak config,
# AMR mapper, verification, status, reset, logs, seed, spokes list
# =============================================================================

hub_parallel_startup() {
    log_info "Starting hub services with dependency-aware parallel orchestration"

    # Vault startup handled by Phase 1 (VAULT_BOOTSTRAP) — skip if already done
    if [ "${HUB_VAULT_BOOTSTRAPPED:-false}" != "true" ]; then
        # Fallback: start Vault if Phase 1 was skipped (e.g., resume mode)
        local vault_profile
        vault_profile=$(_vault_get_profile)
        log_info "Starting Vault services (profile: ${vault_profile})..."
        ${DOCKER_CMD:-docker} compose $HUB_COMPOSE_FILES --profile "$vault_profile" up -d 2>&1 || true
        sleep 5
    else
        log_verbose "Vault already bootstrapped in Phase 1 — skipping startup"
    fi

    # DYNAMIC SERVICE CLASSIFICATION (from docker-compose.hub.yml labels)
    # Uses yq to directly query service labels - more reliable than helper functions
    if ! command -v yq >/dev/null 2>&1; then
        log_warn "yq not found — falling back to sequential startup"
        ${DOCKER_CMD:-docker} compose $HUB_COMPOSE_FILES up -d 2>&1
        return $?
    fi
    local all_services_raw=$(yq eval '.services | keys | .[]' "$HUB_COMPOSE_FILE" 2>/dev/null | xargs)

    # Filter out profile-only services (e.g., authzforce with profiles: ["xacml"])
    local all_services=""
    for svc in $all_services_raw; do
        local profiles=$(yq eval ".services.\"$svc\".profiles // []" "$HUB_COMPOSE_FILE" 2>/dev/null)
        if [ "$profiles" != "[]" ] && [ "$profiles" != "null" ] && [ -n "$profiles" ]; then
            log_verbose "Skipping service '$svc' (in profile: $profiles)"
            continue  # Skip profile-only services
        fi
        all_services="$all_services $svc"
    done
    all_services=$(echo $all_services | xargs)  # Trim whitespace

    # Discover services by class label
    local CORE_SERVICES_RAW=""
    local OPTIONAL_SERVICES_RAW=""
    local STRETCH_SERVICES_RAW=""

    for svc in $all_services; do
        local class=$(yq eval ".services.\"$svc\".labels.\"dive.service.class\" // \"\"" "$HUB_COMPOSE_FILE" 2>/dev/null | tr -d '"')
        case "$class" in
            core)
                CORE_SERVICES_RAW="$CORE_SERVICES_RAW $svc"
                ;;
            optional)
                OPTIONAL_SERVICES_RAW="$OPTIONAL_SERVICES_RAW $svc"
                ;;
            stretch)
                STRETCH_SERVICES_RAW="$STRETCH_SERVICES_RAW $svc"
                ;;
            *)
                # Services without a classification label default to optional
                # This allows new services to be added without blocking deployments
                if [ -n "$class" ]; then
                    log_warn "Unknown service class '$class' for service '$svc', treating as optional"
                else
                    log_verbose "Service '$svc' has no dive.service.class label, treating as optional"
                fi
                OPTIONAL_SERVICES_RAW="$OPTIONAL_SERVICES_RAW $svc"
                ;;
        esac
    done

    # Convert to arrays and trim whitespace
    local -a CORE_SERVICES=($(echo $CORE_SERVICES_RAW | xargs))
    local -a OPTIONAL_SERVICES=($(echo $OPTIONAL_SERVICES_RAW | xargs))
    local -a STRETCH_SERVICES=($(echo $STRETCH_SERVICES_RAW | xargs))

    log_verbose "Discovered services dynamically from $HUB_COMPOSE_FILE:"
    log_verbose "  CORE: ${CORE_SERVICES[*]} (${#CORE_SERVICES[@]} services)"
    log_verbose "  OPTIONAL: ${OPTIONAL_SERVICES[*]} (${#OPTIONAL_SERVICES[@]} services)"
    log_verbose "  STRETCH: ${STRETCH_SERVICES[*]} (${#STRETCH_SERVICES[@]} services)"

    # DYNAMIC DEPENDENCY LEVEL CALCULATION
    # Parse depends_on from docker-compose.hub.yml and calculate levels automatically
    log_verbose "Calculating dependency levels dynamically..."

    # Build dependency map from compose file
    # Handle both depends_on formats:
    #   Simple array: [opa, mongodb]
    #   Object with conditions: {opa: {condition: ...}, mongodb: {condition: ...}}
    declare -A service_deps
    for svc in $all_services; do
        # Try to get dependencies (handle both array and object formats)
        local deps_type=$(yq eval ".services.\"$svc\".depends_on | type" "$HUB_COMPOSE_FILE" 2>/dev/null)

        if [ "$deps_type" = "!!seq" ]; then
            # Simple array format: [opa, mongodb]
            local deps=$(yq eval ".services.\"$svc\".depends_on.[]" "$HUB_COMPOSE_FILE" 2>/dev/null | xargs)
        elif [ "$deps_type" = "!!map" ]; then
            # Object format with conditions: {opa: {condition: ...}}
            local deps=$(yq eval ".services.\"$svc\".depends_on | keys | .[]" "$HUB_COMPOSE_FILE" 2>/dev/null | xargs)
        else
            # No dependencies or null
            local deps=""
        fi

        if [ -z "$deps" ]; then
            service_deps["$svc"]="none"
        else
            service_deps["$svc"]="$deps"
        fi
    done

    # Calculate dependency level for each service
    declare -A service_levels
    declare -A level_services  # Reverse map: level -> services
    local max_level=0

    for svc in $all_services; do
        local level=$(calculate_service_level "$svc")
        service_levels["$svc"]=$level

        # Add to level_services map
        if [ -z "${level_services[$level]:-}" ]; then
            level_services[$level]="$svc"
        else
            level_services[$level]="${level_services[$level]} $svc"
        fi

        # Track max level
        if [ $level -gt $max_level ]; then
            max_level=$level
        fi
    done

    log_verbose "Dependency levels calculated (max level: $max_level):"
    for ((lvl=0; lvl<=max_level; lvl++)); do
        local services_at_level="${level_services[$lvl]:-}"
        if [ -n "$services_at_level" ]; then
            local count=$(echo "$services_at_level" | wc -w | tr -d ' ')
            log_verbose "  Level $lvl: $services_at_level ($count services)"
        fi
    done

    local total_services=$(echo "$all_services" | wc -w | tr -d ' ')
    local total_started=0
    local total_failed=0
    local start_time=$(date +%s)

    log_verbose "Service graph has $((max_level + 1)) dependency levels (0-$max_level) with $total_services total services"

    # Start services level by level
    for ((level=0; level<=max_level; level++)); do
        # Get services at this level
        local level_services_str="${level_services[$level]:-}"

        if [ -z "$level_services_str" ]; then
            log_verbose "Level $level: No services to start"
            continue
        fi

        # Convert to array
        local -a current_level_services=($level_services_str)

        log_info "Level $level: Starting ${current_level_services[*]}"

        # Start all services at this level in parallel
        local pids=()
        declare -A service_pid_map

        for service in "${current_level_services[@]}"; do
            (
                # Calculate dynamic timeout based on service type
                local timeout
                case "$service" in
                    postgres)         timeout=${TIMEOUT_POSTGRES:-60} ;;
                    mongodb)          timeout=${TIMEOUT_MONGODB:-90} ;;
                    redis)            timeout=${TIMEOUT_REDIS:-30} ;;
                    redis-blacklist)  timeout=${TIMEOUT_REDIS:-30} ;;
                    keycloak)         timeout=${TIMEOUT_KEYCLOAK:-180} ;;
                    opa)              timeout=${TIMEOUT_OPA:-30} ;;
                    backend)          timeout=${TIMEOUT_BACKEND:-120} ;;
                    frontend)         timeout=${TIMEOUT_FRONTEND:-90} ;;
                    kas)              timeout=${TIMEOUT_KAS:-60} ;;
                    authzforce)       timeout=${TIMEOUT_AUTHZFORCE:-90} ;;
                    opal-server)      timeout=${TIMEOUT_OPAL:-60} ;;
                    otel-collector)   timeout=${TIMEOUT_OTEL:-30} ;;
                    *)                timeout=60 ;;
                esac

                local container="${COMPOSE_PROJECT_NAME:-dive-hub}-${service}"

                # Check if already running and healthy
                if ${DOCKER_CMD:-docker} ps --format '{{.Names}}' | grep -q "^${container}$"; then
                    local health=$(${DOCKER_CMD:-docker} inspect "$container" --format='{{.State.Health.Status}}' 2>/dev/null || echo "unknown")
                    if [ "$health" = "healthy" ]; then
                        log_verbose "Service $service already running and healthy"
                        exit 0
                    fi
                fi

                # Start service using ${DOCKER_CMD:-docker} compose
                log_verbose "Starting $service (timeout: ${timeout}s)"
                local start_output
                if ! start_output=$(${DOCKER_CMD:-docker} compose $HUB_COMPOSE_FILES up -d "$service" 2>&1); then
                    log_error "Failed to start $service container"
                    # FIX: Provide detailed error information for debugging
                    log_error "Docker compose output: $start_output"
                    log_error "Check service definition in $HUB_COMPOSE_FILE"
                    # FIXED (2026-01-28): Escape brackets in grep pattern to prevent "brackets not balanced" error
                    local deps_pattern=$(echo "${current_level_services[@]}" | tr ' ' '|')
                    log_error "Verify dependencies are running: docker ps | grep -E '($deps_pattern)'"
                    exit 1
                fi

                # Wait for health with timeout
                local elapsed=0
                local interval=3

                while [ $elapsed -lt $timeout ]; do
                    # Check container state
                    local state=$(${DOCKER_CMD:-docker} inspect "$container" --format='{{.State.Status}}' 2>/dev/null || echo "not_found")

                    if [ "$state" = "not_found" ]; then
                        log_error "Container $container not found"
                        exit 1
                    elif [ "$state" != "running" ]; then
                        log_verbose "$service: Container state=$state (waiting...)"
                        sleep $interval
                        elapsed=$((elapsed + interval))
                        continue
                    fi

                    # Check health status
                    local health=$(${DOCKER_CMD:-docker} inspect "$container" --format='{{.State.Health.Status}}' 2>/dev/null || echo "none")

                    # Trim whitespace and handle empty/none cases
                    health=$(echo "$health" | tr -d '[:space:]')

                    if [ "$health" = "healthy" ]; then
                        log_success "$service is healthy (${elapsed}s)"
                        exit 0
                    elif [ "$health" = "none" ] || [ -z "$health" ] || [ "$health" = "" ]; then
                        # During start_period, health status may be empty string
                        # If container is running, wait a bit more for health check to initialize
                        if [ "$state" = "running" ]; then
                            # Health check might be in start_period - wait a bit more
                            if [ $elapsed -lt 10 ]; then
                                log_verbose "$service: Container running, waiting for health check to initialize ($elapsed/${timeout}s)"
                                sleep $interval
                                elapsed=$((elapsed + interval))
                                continue
                            else
                                # After 10s, if still no health status and container is running, assume healthy
                                log_verbose "$service is running (health check not yet initialized, assuming healthy)"
                                exit 0
                            fi
                        else
                            # Container not running - continue waiting
                            sleep $interval
                            elapsed=$((elapsed + interval))
                            continue
                        fi
                    fi

                    # Progress indicator
                    if [ $((elapsed % 15)) -eq 0 ] && [ $elapsed -gt 0 ]; then
                        log_verbose "$service: Still waiting for healthy state ($elapsed/${timeout}s)"
                    fi

                    sleep $interval
                    elapsed=$((elapsed + interval))
                done

                log_error "$service: Timeout after ${timeout}s (health: $health)"
                exit 1
            ) &

            local pid=$!
            pids+=($pid)
            service_pid_map[$pid]=$service
        done

        # Wait for all services at this level
        local level_failed=0
        local level_core_failed=0
        for pid in "${pids[@]}"; do
            local service="${service_pid_map[$pid]}"
            local container="${COMPOSE_PROJECT_NAME:-dive-hub}-${service}"

            if wait $pid; then
                ((total_started++))

                # Update progress with current healthy service count
                if type progress_set_services &>/dev/null; then
                    progress_set_services "$total_started" 12
                fi
            else
                ((total_failed++))
                ((level_failed++))

                # Check if this is a CORE, OPTIONAL, or STRETCH service
                local is_core=false
                local is_optional=false
                local is_stretch=false

                for core_svc in "${CORE_SERVICES[@]}"; do
                    if [ "$service" = "$core_svc" ]; then
                        is_core=true
                        ((level_core_failed++))
                        break
                    fi
                done

                if ! $is_core; then
                    for opt_svc in "${OPTIONAL_SERVICES[@]}"; do
                        if [ "$service" = "$opt_svc" ]; then
                            is_optional=true
                            break
                        fi
                    done
                fi

                if ! $is_core && ! $is_optional; then
                    for stretch_svc in "${STRETCH_SERVICES[@]}"; do
                        if [ "$service" = "$stretch_svc" ]; then
                            is_stretch=true
                            break
                        fi
                    done
                fi

                # Log appropriate message based on service classification
                if $is_core; then
                    log_error "Service $service failed to start at level $level (CORE - deployment will fail)"
                    log_error "Check logs: docker logs $container"
                    log_error "Check container state: docker inspect $container | jq '.[0].State'"
                elif $is_optional; then
                    log_warn "Service $service failed to start at level $level (OPTIONAL - deployment will continue)"
                    log_verbose "Check logs: docker logs $container"
                elif $is_stretch; then
                    log_warn "Service $service failed to start at level $level (STRETCH - deployment will continue)"
                    log_verbose "Check logs: docker logs $container"
                    # FIX: Provide helpful debugging info for KAS failures
                    if [ "$service" = "kas" ]; then
                        log_verbose "KAS troubleshooting:"
                        log_verbose "  1. Check certificates: ls -la kas/certs/"
                        log_verbose "  2. Check build: docker images | grep kas"
                        log_verbose "  3. Check dependencies: docker ps | grep -E '(opa|mongodb)'"
                        log_verbose "  4. Check logs: docker logs $container | tail -50"
                    fi
                else
                    log_error "Service $service failed to start at level $level (UNKNOWN classification - treating as CORE)"
                    log_error "Check logs: docker logs $container"
                    ((level_core_failed++))
                fi

                # Record failure in metrics if available
                if type metrics_record_service_failure &>/dev/null; then
                    metrics_record_service_failure "HUB" "$service" "startup_timeout"
                fi
            fi
        done

        # Only fail if CORE services failed at this level
        if [ $level_core_failed -gt 0 ]; then
            log_error "Level $level had $level_core_failed CORE service failures"
            log_error "Stopping parallel startup - fix CORE service failures and redeploy"
            return 1
        elif [ $level_failed -gt 0 ]; then
            log_warn "Level $level had $level_failed failures, but all CORE services operational"
            log_warn "Deployment will continue without optional/stretch services"
        fi

        local level_time=$(($(date +%s) - start_time))
        log_verbose "Level $level complete in ${level_time}s (cumulative)"
    done

    local end_time=$(date +%s)
    local total_time=$((end_time - start_time))

    # Summary
    local core_started=$((total_started - total_failed))
    log_success "Parallel startup complete: $total_started services started in ${total_time}s"
    if [ $total_failed -gt 0 ]; then
        log_warn "Note: $total_failed optional/stretch services did not start (see warnings above)"
    fi

    # Record metrics
    if type metrics_record_deployment_phase &>/dev/null; then
        metrics_record_deployment_phase "HUB" "hub" "parallel_startup" "$total_time"
    fi

    # Only fail if CORE services failed (already checked in level loop)
    return 0
}

##
# Wait for hub services to become healthy
##
hub_wait_healthy() {
    log_info "Waiting for hub services to become healthy..."

    local services=("dive-hub-postgres" "dive-hub-keycloak" "dive-hub-backend")
    local max_wait=300
    local elapsed=0

    for service in "${services[@]}"; do
        log_verbose "Waiting for $service..."

        while [ $elapsed -lt $max_wait ]; do
            local status=$(${DOCKER_CMD:-docker} inspect "$service" --format='{{.State.Health.Status}}' 2>/dev/null || echo "not_found")

            if [ "$status" = "healthy" ]; then
                log_success "$service is healthy"
                break
            elif [ "$status" = "not_found" ]; then
                log_error "$service not found"
                return 1
            fi

            sleep 5
            ((elapsed += 5))
        done

        if [ $elapsed -ge $max_wait ]; then
            log_error "Timeout waiting for $service"
            return 1
        fi
    done

    log_success "All hub services healthy"
    return 0
}

##
# Initialize orchestration database
##
hub_init_orchestration_db() {
    log_verbose "Initializing orchestration database..."

    # Wait for postgres to be ready
    local max_wait=60
    local elapsed=0
    while [ $elapsed -lt $max_wait ]; do
        if ${DOCKER_CMD:-docker} exec dive-hub-postgres pg_isready -U postgres >/dev/null 2>&1; then
            break
        fi
        sleep 1  # OPTIMIZATION: Faster polling for responsiveness
        ((elapsed += 1))
    done

    # Create orchestration database
    ${DOCKER_CMD:-docker} exec dive-hub-postgres psql -U postgres -c "CREATE DATABASE orchestration;" >/dev/null 2>&1 || true

    # Apply full orchestration schema from migration file (CRITICAL - includes state_transitions)
    if [ -f "${DIVE_ROOT}/scripts/migrations/001_orchestration_state_db.sql" ]; then
        log_verbose "Applying full orchestration schema..."

        # Remove the \c orchestration command since we're already targeting the orchestration database
        # and copy the migration into the container for proper execution
        local temp_migration="/tmp/orchestration_migration_$$.sql"
        grep -v '^\\c orchestration' "${DIVE_ROOT}/scripts/migrations/001_orchestration_state_db.sql" > "${temp_migration}"

        ${DOCKER_CMD:-docker} cp "${temp_migration}" dive-hub-postgres:/tmp/migration.sql
        rm -f "${temp_migration}"

        if ${DOCKER_CMD:-docker} exec dive-hub-postgres psql -U postgres -d orchestration -f /tmp/migration.sql >/dev/null 2>&1; then
            log_verbose "✓ Orchestration schema applied"
            ${DOCKER_CMD:-docker} exec dive-hub-postgres rm -f /tmp/migration.sql
        else
            log_error "CRITICAL: Orchestration schema migration FAILED"
            ${DOCKER_CMD:-docker} exec dive-hub-postgres rm -f /tmp/migration.sql
            return 1
        fi

        # Verify all required tables exist
        local required_tables=("deployment_states" "state_transitions" "deployment_steps"
                               "deployment_locks" "circuit_breakers" "orchestration_errors"
                               "orchestration_metrics" "checkpoints")
        local missing_tables=0

        for table in "${required_tables[@]}"; do
            if ! ${DOCKER_CMD:-docker} exec dive-hub-postgres psql -U postgres -d orchestration -c "\d $table" >/dev/null 2>&1; then
                log_error "Required table missing: $table"
                missing_tables=$((missing_tables + 1))
            fi
        done

        if [ $missing_tables -gt 0 ]; then
            log_error "CRITICAL: $missing_tables required tables missing"
            return 1
        fi

        log_verbose "All 8 orchestration tables verified"
    else
        log_error "CRITICAL: Orchestration schema file not found"
        return 1
    fi

    # Initialize federation schema (database-driven federation state)
    if [ -f "${DIVE_ROOT}/scripts/sql/002_federation_schema.sql" ]; then
        log_verbose "Applying federation schema..."
        if ${DOCKER_CMD:-docker} exec -i dive-hub-postgres psql -U postgres -d orchestration < "${DIVE_ROOT}/scripts/sql/002_federation_schema.sql" >/dev/null 2>&1; then
            log_verbose "✓ Federation schema applied"
        else
            log_warn "Federation schema initialization had issues (may already exist)"
        fi
    fi

    log_success "Orchestration database initialized"
}

##
# Configure Keycloak realm and clients
##
hub_configure_keycloak() {
    log_info "Configuring Keycloak..."

    # Check if Keycloak is ready
    local kc_ready=false
    for i in {1..30}; do
        # Keycloak health endpoint is on management port 9000 (HTTPS)
        if ${DOCKER_CMD:-docker} exec dive-hub-keycloak curl -sfk https://localhost:9000/health/ready >/dev/null 2>&1; then
            kc_ready=true
            break
        # Fallback: check if master realm is accessible
        elif ${DOCKER_CMD:-docker} exec dive-hub-keycloak curl -sf http://localhost:8080/realms/master >/dev/null 2>&1; then
            kc_ready=true
            break
        fi
        sleep 2
    done

    if [ "$kc_ready" != "true" ]; then
        log_warn "Keycloak not ready for configuration"
        return 1
    fi

    # Run Terraform if available
    if [ -d "${DIVE_ROOT}/terraform/hub" ] && command -v terraform >/dev/null 2>&1; then
        log_verbose "Running Terraform configuration..."

        # Verify Terraform state is clean (prevents resource conflicts)
        if [ -f "${DIVE_ROOT}/terraform/hub/terraform.tfstate" ]; then
            log_warn "Terraform state exists - checking for potential conflicts..."

            # Count resources in state
            local state_resources=$(cd "${DIVE_ROOT}/terraform/hub" && terraform state list 2>/dev/null | wc -l | tr -d ' ')

            if [ "$state_resources" -gt 0 ]; then
                log_warn "Found $state_resources resources in Terraform state"
                log_warn "This may cause 'resource already exists' errors"
                log_info "If deployment fails, run: ./dive nuke --confirm"
            fi
        else
            log_verbose "Clean Terraform state - fresh deployment"
        fi

        # Source .env.hub to get secrets
        if [ -f "${DIVE_ROOT}/.env.hub" ]; then
            set -a
            source "${DIVE_ROOT}/.env.hub"
            set +a
        else
            log_error "No .env.hub file found"
            return 1
        fi

        (
            cd "${DIVE_ROOT}/terraform/hub"

            # CRITICAL: Unset KEYCLOAK_REALM so the Terraform Keycloak provider
            # defaults to 'master' realm for admin login. The .env.hub sets
            # KEYCLOAK_REALM=dive-v3-broker-usa which is for runtime services,
            # NOT for Terraform's initial admin authentication.
            unset KEYCLOAK_REALM

            # Initialize Terraform (only if not already initialized)
            if [ ! -d ".terraform" ]; then
                log_verbose "Initializing Terraform..."
                terraform init -upgrade >/dev/null 2>&1
            else
                log_verbose "Terraform already initialized"
            fi

            # Export Terraform variables
            export TF_VAR_keycloak_admin_password="${KEYCLOAK_ADMIN_PASSWORD}"
            export TF_VAR_client_secret="${KEYCLOAK_CLIENT_SECRET_USA:-${KEYCLOAK_CLIENT_SECRET:-}}"
            export TF_VAR_test_user_password="${TEST_USER_PASSWORD:-${KEYCLOAK_ADMIN_PASSWORD}}"
            export TF_VAR_admin_user_password="${ADMIN_PASSWORD:-${KEYCLOAK_ADMIN_PASSWORD}}"
            export KEYCLOAK_USER="admin"
            export KEYCLOAK_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD}"

            # Verify variables set
            if [ -z "$TF_VAR_keycloak_admin_password" ] || [ -z "$TF_VAR_client_secret" ]; then
                log_error "Required Terraform variables not set"
                return 1
            fi

            log_verbose "Terraform variables validated"

            # Apply with performance optimizations
            log_verbose "Applying Terraform configuration (optimized for performance)..."

            # Build extra -var overrides for EC2 external access
            # -var flags override -var-file (highest precedence)
            local tf_extra_vars=""
            if [ -n "${HUB_EXTERNAL_ADDRESS:-}" ] && [ "$HUB_EXTERNAL_ADDRESS" != "localhost" ]; then
                if [ -n "${CADDY_DOMAIN_IDP:-}" ]; then
                    # Caddy mode: domain-based URLs (standard HTTPS port)
                    tf_extra_vars="-var idp_url=https://${CADDY_DOMAIN_IDP}"
                    tf_extra_vars="$tf_extra_vars -var app_url=https://${CADDY_DOMAIN_APP}"
                    tf_extra_vars="$tf_extra_vars -var api_url=https://${CADDY_DOMAIN_API}"
                else
                    # IP mode: port-based URLs
                    local ext="$HUB_EXTERNAL_ADDRESS"
                    tf_extra_vars="-var idp_url=https://${ext}:${KEYCLOAK_HTTPS_PORT:-8443}"
                    tf_extra_vars="$tf_extra_vars -var app_url=https://${ext}:${FRONTEND_PORT:-3000}"
                    tf_extra_vars="$tf_extra_vars -var api_url=https://${ext}:${BACKEND_PORT:-4000}"
                fi
            fi

            # shellcheck disable=SC2086
            terraform apply \
                -auto-approve \
                -var-file="hub.tfvars" \
                $tf_extra_vars \
                -parallelism=20 \
                -compact-warnings \
                -no-color
        ) || {
            log_error "Terraform apply failed"
            return 1
        }
    fi

    # CRITICAL FIX (2026-02-14): Verify oidc-amr-mapper exists on broker client
    # The Terraform keycloak_generic_protocol_mapper resource for oidc-amr-mapper
    # has a provider bug where it records state but the mapper doesn't persist in
    # Keycloak. This post-Terraform step verifies and creates it if missing.
    _hub_ensure_amr_mapper_exists

    log_success "Keycloak configuration complete"
    return 0
}

##
# Ensure the oidc-amr-mapper exists on the broker client
# Works around Terraform provider bug with keycloak_generic_protocol_mapper
##
_hub_ensure_amr_mapper_exists() {
    local realm="dive-v3-broker-usa"
    local client_id="dive-v3-broker-usa"
    local keycloak_url="https://localhost:${KEYCLOAK_HTTPS_PORT:-8443}"
    local admin_pass="${KEYCLOAK_ADMIN_PASSWORD:-}"

    if [ -z "$admin_pass" ]; then
        log_warn "No admin password available — skipping AMR mapper verification"
        return 0
    fi

    # Get admin token
    local admin_token
    admin_token=$(curl -sk "${keycloak_url}/realms/master/protocol/openid-connect/token" \
        -d "client_id=admin-cli" \
        -d "username=admin" \
        -d "password=${admin_pass}" \
        -d "grant_type=password" 2>/dev/null | jq -r '.access_token // empty')

    if [ -z "$admin_token" ]; then
        log_warn "Could not get admin token — skipping AMR mapper verification"
        return 0
    fi

    # Get broker client UUID
    local client_uuid
    client_uuid=$(curl -sk "${keycloak_url}/admin/realms/${realm}/clients?clientId=${client_id}" \
        -H "Authorization: Bearer $admin_token" 2>/dev/null | jq -r '.[0].id // empty')

    if [ -z "$client_uuid" ]; then
        log_warn "Could not find broker client UUID — skipping AMR mapper verification"
        return 0
    fi

    # Check if oidc-amr-mapper exists
    local amr_mapper_exists
    amr_mapper_exists=$(curl -sk "${keycloak_url}/admin/realms/${realm}/clients/${client_uuid}/protocol-mappers/models" \
        -H "Authorization: Bearer $admin_token" 2>/dev/null | \
        jq -r '[.[] | select(.protocolMapper == "oidc-amr-mapper")] | length')

    if [ "${amr_mapper_exists:-0}" -gt 0 ]; then
        log_verbose "oidc-amr-mapper already exists on broker client"
        return 0
    fi

    log_warn "oidc-amr-mapper MISSING from broker client — creating via admin API"
    log_warn "This is a workaround for a Terraform provider bug (keycloak_generic_protocol_mapper)"

    # Create the missing oidc-amr-mapper
    local mapper_json='{"name":"amr (native session)","protocol":"openid-connect","protocolMapper":"oidc-amr-mapper","config":{"id.token.claim":"true","access.token.claim":"true","introspection.token.claim":"true","userinfo.token.claim":"true","claim.name":"amr"}}'

    local http_code
    http_code=$(curl -sk -X POST "${keycloak_url}/admin/realms/${realm}/clients/${client_uuid}/protocol-mappers/models" \
        -H "Authorization: Bearer $admin_token" \
        -H "Content-Type: application/json" \
        -d "$mapper_json" \
        -o /dev/null -w "%{http_code}")

    if [ "$http_code" = "201" ]; then
        log_success "Created oidc-amr-mapper on broker client"
    else
        log_warn "Failed to create oidc-amr-mapper (HTTP $http_code) — MFA enforcement may not work"
    fi

    # Also ensure amr (user attribute fallback) exists for federated users
    local amr_fallback_exists
    amr_fallback_exists=$(curl -sk "${keycloak_url}/admin/realms/${realm}/clients/${client_uuid}/protocol-mappers/models" \
        -H "Authorization: Bearer $admin_token" 2>/dev/null | \
        jq -r '[.[] | select(.config["claim.name"] == "user_amr")] | length')

    if [ "${amr_fallback_exists:-0}" -eq 0 ]; then
        log_warn "user_amr fallback mapper missing — creating"
        local fallback_json='{"name":"amr (user attribute fallback)","protocol":"openid-connect","protocolMapper":"oidc-usermodel-attribute-mapper","config":{"introspection.token.claim":"true","userinfo.token.claim":"true","multivalued":"true","user.attribute":"amr","id.token.claim":"true","access.token.claim":"true","claim.name":"user_amr","jsonType.label":"String"}}'
        curl -sk -X POST "${keycloak_url}/admin/realms/${realm}/clients/${client_uuid}/protocol-mappers/models" \
            -H "Authorization: Bearer $admin_token" \
            -H "Content-Type: application/json" \
            -d "$fallback_json" \
            -o /dev/null -w "" 2>/dev/null
    fi

    # Also ensure acr (user attribute fallback) exists
    local acr_fallback_exists
    acr_fallback_exists=$(curl -sk "${keycloak_url}/admin/realms/${realm}/clients/${client_uuid}/protocol-mappers/models" \
        -H "Authorization: Bearer $admin_token" 2>/dev/null | \
        jq -r '[.[] | select(.config["claim.name"] == "user_acr")] | length')

    if [ "${acr_fallback_exists:-0}" -eq 0 ]; then
        log_warn "user_acr fallback mapper missing — creating"
        local acr_fallback_json='{"name":"acr (user attribute fallback)","protocol":"openid-connect","protocolMapper":"oidc-usermodel-attribute-mapper","config":{"introspection.token.claim":"true","userinfo.token.claim":"true","multivalued":"false","user.attribute":"acr","id.token.claim":"true","access.token.claim":"true","claim.name":"user_acr","jsonType.label":"String"}}'
        curl -sk -X POST "${keycloak_url}/admin/realms/${realm}/clients/${client_uuid}/protocol-mappers/models" \
            -H "Authorization: Bearer $admin_token" \
            -H "Content-Type: application/json" \
            -d "$acr_fallback_json" \
            -o /dev/null -w "" 2>/dev/null
    fi

    return 0
}

##
# Verify Keycloak realm exists
##
hub_verify_realm() {
    local realm="dive-v3-broker-usa"
    local keycloak_url="https://localhost:${KEYCLOAK_HTTPS_PORT:-8443}"
    local max_retries=10
    local retry_delay=3

    log_verbose "Verifying realm '$realm' exists..."

    for i in $(seq 1 $max_retries); do
        # Check if realm exists
        local realm_response
        realm_response=$(curl -sk --max-time 10 "${keycloak_url}/realms/${realm}" 2>/dev/null)

        if [ $? -eq 0 ]; then
            local realm_name
            realm_name=$(echo "$realm_response" | jq -r '.realm // empty' 2>/dev/null)

            if [ "$realm_name" = "$realm" ]; then
                log_success "Realm '$realm' verified"
                return 0
            fi
        fi

        if [ $i -lt $max_retries ]; then
            log_verbose "Retry $i/$max_retries: Waiting ${retry_delay}s..."
            sleep $retry_delay
        fi
    done

    log_error "Realm '$realm' not found after $max_retries attempts"
    return 1
}

##
# Verify hub deployment with automated tests
##
hub_verify() {
    log_info "Running hub deployment validation..."

    if [ ! -f "${DIVE_ROOT}/tests/validate-hub-deployment.sh" ]; then
        log_error "Validation script not found"
        return 1
    fi

    bash "${DIVE_ROOT}/tests/validate-hub-deployment.sh"
    return $?
}

##
# Show hub status
##
hub_status() {
    echo "=== Hub Status ==="
    echo ""

    # Container status
    echo "Containers:"
    ${DOCKER_CMD:-docker} ps --filter "name=dive-hub" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "  No containers running"

    echo ""
    echo "Health:"
    for container in dive-hub-postgres dive-hub-keycloak dive-hub-backend dive-hub-frontend; do
        local health=$(${DOCKER_CMD:-docker} inspect "$container" --format='{{.State.Health.Status}}' 2>/dev/null || echo "not_found")
        printf "  %-25s %s\n" "$container" "$health"
    done

    # Database state
    if type orch_db_check_connection &>/dev/null && orch_db_check_connection; then
        echo ""
        echo "Orchestration Database: Connected"
    else
        echo ""
        echo "Orchestration Database: Not connected"
    fi
}

##
# Reset hub to clean state
##
hub_reset() {
    log_warn "Resetting hub to clean state..."

    hub_down

    # Remove volumes
    ${DOCKER_CMD:-docker} volume rm dive-hub-postgres-data dive-hub-mongodb-data 2>/dev/null || true

    # Clean data directory
    rm -rf "${HUB_DATA_DIR}"/*

    log_success "Hub reset complete"
    echo "Run './dive hub deploy' to redeploy"
}

##
# View hub logs
##
hub_logs() {
    local service="${1:-}"

    cd "$DIVE_ROOT"

    if [ -n "$service" ]; then
        ${DOCKER_CMD:-docker} compose $HUB_COMPOSE_FILES logs -f "$service"
    else
        ${DOCKER_CMD:-docker} compose $HUB_COMPOSE_FILES logs -f
    fi
}

##
# Seed hub database with test data
# SSOT: Delegates to hub/seed.sh module for comprehensive seeding
##
hub_seed() {
    local count="${1:-5000}"

    # Load comprehensive hub seeding module (SSOT)
    if [ -f "${MODULES_DIR}/hub/seed.sh" ]; then
        source "${MODULES_DIR}/hub/seed.sh"
        # Call the comprehensive hub_seed function from the module
        hub_seed "$count"
    else
        log_error "Hub seeding module not found"
        return 1
    fi
}

##
# List registered spokes
##
hub_spokes_list() {
    echo "=== Registered Spokes ==="

    if type orch_db_check_connection &>/dev/null && orch_db_check_connection; then
        orch_db_exec "
            SELECT instance_code, state,
                   to_char(timestamp, 'YYYY-MM-DD HH24:MI') as last_update
            FROM deployment_states
            WHERE instance_code != 'hub'
            ORDER BY instance_code
        " 2>/dev/null || echo "  No spokes registered"
    else
        echo "  Database not available"
    fi
}

# =============================================================================
# MODULE DISPATCH
# =============================================================================

##
# Hub module command dispatcher
##
