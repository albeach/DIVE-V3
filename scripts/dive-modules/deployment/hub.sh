#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 Hub Deployment Module (Consolidated)
# =============================================================================
# Hub deployment, initialization, and management
# =============================================================================
# Version: 5.0.0 (Module Consolidation)
# Date: 2026-01-22
#
# Consolidates:
#   - hub.sh (dispatcher)
#   - hub/deploy.sh, hub/init.sh, hub/seed.sh, hub/services.sh, hub/spokes.sh
# =============================================================================

# Prevent multiple sourcing
[ -n "$DIVE_DEPLOYMENT_HUB_LOADED" ] && return 0
export DIVE_DEPLOYMENT_HUB_LOADED=1

# =============================================================================
# LOAD DEPENDENCIES
# =============================================================================

DEPLOYMENT_DIR="$(dirname "${BASH_SOURCE[0]}")"
MODULES_DIR="$(dirname "$DEPLOYMENT_DIR")"

if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "${MODULES_DIR}/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Load orchestration modules
if [ -f "${MODULES_DIR}/orchestration/framework.sh" ]; then
    source "${MODULES_DIR}/orchestration/framework.sh"
elif [ -f "${MODULES_DIR}/orchestration-framework.sh" ]; then
    source "${MODULES_DIR}/orchestration-framework.sh"
fi

if [ -f "${MODULES_DIR}/orchestration-state-db.sh" ]; then
    source "${MODULES_DIR}/orchestration-state-db.sh"
fi

# =============================================================================
# HUB CONFIGURATION
# =============================================================================

HUB_COMPOSE_FILE="${DIVE_ROOT}/docker-compose.hub.yml"
HUB_DATA_DIR="${DIVE_ROOT}/data/hub"

# =============================================================================
# HUB DEPLOYMENT
# =============================================================================

##
# Full hub deployment workflow
##
hub_deploy() {
    log_step "Starting Hub deployment..."

    local start_time=$(date +%s)
    local phase_times=()

    # Initialize request context
    if type init_request_context &>/dev/null; then
        init_request_context "hub-deployment" "deploy"
    fi

    # Preflight checks
    local phase_start=$(date +%s)
    log_info "Phase 1: Preflight checks"
    if ! hub_preflight; then
        log_error "Preflight checks failed"
        return 1
    fi
    local phase_end=$(date +%s)
    local phase1_duration=$((phase_end - phase_start))
    phase_times+=("Phase 1 (Preflight): ${phase1_duration}s")
    log_verbose "Phase 1 completed in ${phase1_duration}s"

    # Initialize
    phase_start=$(date +%s)
    log_info "Phase 2: Initialization"
    if ! hub_init; then
        log_error "Initialization failed"
        return 1
    fi
    phase_end=$(date +%s)
    local phase2_duration=$((phase_end - phase_start))
    phase_times+=("Phase 2 (Initialization): ${phase2_duration}s")
    log_verbose "Phase 2 completed in ${phase2_duration}s"

    # Start services
    phase_start=$(date +%s)
    log_info "Phase 3: Starting services"
    if ! hub_up; then
        log_error "Service startup failed"
        return 1
    fi
    phase_end=$(date +%s)
    local phase3_duration=$((phase_end - phase_start))
    phase_times+=("Phase 3 (Services): ${phase3_duration}s")
    log_verbose "Phase 3 completed in ${phase3_duration}s"

    # Wait for healthy (MongoDB container accepting connections)
    phase_start=$(date +%s)
    log_info "Phase 4: Health verification (container ready)"
    if ! hub_wait_healthy; then
        log_error "Health verification failed"
        return 1
    fi
    phase_end=$(date +%s)
    local phase4_duration=$((phase_end - phase_start))
    phase_times+=("Phase 4 (Health): ${phase4_duration}s")
    log_verbose "Phase 4 completed in ${phase4_duration}s"

    # Phase 4a: Initialize MongoDB replica set (CRITICAL - required for change streams)
    phase_start=$(date +%s)
    log_info "Phase 4a: Initializing MongoDB replica set"
    if [ ! -f "${DIVE_ROOT}/scripts/init-mongo-replica-set-post-start.sh" ]; then
        log_error "CRITICAL: MongoDB initialization script not found"
        return 1
    fi

    if ! bash "${DIVE_ROOT}/scripts/init-mongo-replica-set-post-start.sh" dive-hub-mongodb admin "$MONGO_PASSWORD"; then
        log_error "CRITICAL: MongoDB replica set initialization FAILED"
        log_error "This will cause 'not primary' errors and deployment failure"
        return 1
    fi
    log_success "MongoDB replica set initialized"
    phase_end=$(date +%s)
    local phase4a_duration=$((phase_end - phase_start))
    phase_times+=("Phase 4a (MongoDB Init): ${phase4a_duration}s")
    log_verbose "Phase 4a completed in ${phase4a_duration}s"

    # Phase 4b: Wait for PRIMARY status (explicit verification with increased timeout)
    phase_start=$(date +%s)
    log_info "Phase 4b: Waiting for MongoDB PRIMARY status"
    local max_wait=90  # Increased from 60s to 90s
    local elapsed=0
    local is_primary=false

    while [ $elapsed -lt $max_wait ]; do
        local state=$(docker exec dive-hub-mongodb mongosh admin -u admin -p "$MONGO_PASSWORD" --quiet --eval "rs.status().members[0].stateStr" 2>/dev/null || echo "ERROR")

        if [ "$state" = "PRIMARY" ]; then
            is_primary=true
            log_success "MongoDB achieved PRIMARY status (${elapsed}s)"
            break
        elif [ "$state" = "ERROR" ]; then
            log_verbose "MongoDB state: ERROR (replica set may still be initializing...)"
        else
            log_verbose "MongoDB state: $state (waiting for PRIMARY...)"
        fi

        sleep 3  # Check every 3 seconds (more reasonable than 2s)
        elapsed=$((elapsed + 3))
    done

    if [ "$is_primary" != "true" ]; then
        log_error "CRITICAL: Timeout waiting for MongoDB PRIMARY (${max_wait}s)"
        log_error "This usually indicates:"
        log_error "  - KeyFile permissions issue (check /tmp/mongo-keyfile in container)"
        log_error "  - Resource constraints (insufficient CPU/memory)"
        log_error "  - Network configuration problem"
        log_error ""
        log_error "Current state: $(docker exec dive-hub-mongodb mongosh admin -u admin -p "$MONGO_PASSWORD" --quiet --eval "rs.status().members[0].stateStr" 2>/dev/null || echo "UNKNOWN")"
        log_error "Check logs: docker logs dive-hub-mongodb"
        return 1
    fi
    phase_end=$(date +%s)
    local phase4b_duration=$((phase_end - phase_start))
    phase_times+=("Phase 4b (MongoDB PRIMARY): ${phase4b_duration}s")
    log_verbose "Phase 4b completed in ${phase4b_duration}s"

    # Phase 4c: Verify backend can connect (may need retry due to initialization timing)
    phase_start=$(date +%s)
    log_info "Phase 4c: Verifying backend connectivity"
    # Backend will use retry logic from mongodb-connection.ts
    # Just wait for backend to become healthy
    phase_end=$(date +%s)
    local phase4c_duration=$((phase_end - phase_start))
    phase_times+=("Phase 4c (Backend Verify): ${phase4c_duration}s")
    log_verbose "Phase 4c completed in ${phase4c_duration}s"

    # Initialize orchestration database
    phase_start=$(date +%s)
    log_info "Phase 5: Orchestration database initialization"
    hub_init_orchestration_db
    phase_end=$(date +%s)
    local phase5_duration=$((phase_end - phase_start))
    phase_times+=("Phase 5 (Orch DB): ${phase5_duration}s")
    log_verbose "Phase 5 completed in ${phase5_duration}s"

    # Configure Keycloak
    phase_start=$(date +%s)
    log_info "Phase 6: Keycloak configuration"
    if ! hub_configure_keycloak; then
        log_error "CRITICAL: Keycloak configuration FAILED"
        log_error "Hub is unusable without realm configuration"
        log_error "Fix Keycloak issues and redeploy"
        return 1
    fi
    phase_end=$(date +%s)
    local phase6_duration=$((phase_end - phase_start))
    phase_times+=("Phase 6 (Keycloak): ${phase6_duration}s")
    log_verbose "Phase 6 completed in ${phase6_duration}s"

    # Verify realm exists after configuration
    phase_start=$(date +%s)
    log_info "Phase 6.5: Verifying realm creation"
    if ! hub_verify_realm; then
        log_error "CRITICAL: Realm verification FAILED"
        log_error "Keycloak configuration completed but realm doesn't exist"
        log_error "This indicates Terraform or Keycloak state issues"
        return 1
    fi
    phase_end=$(date +%s)
    local phase6_5_duration=$((phase_end - phase_start))
    phase_times+=("Phase 6.5 (Realm Verify): ${phase6_5_duration}s")
    log_verbose "Phase 6.5 completed in ${phase6_5_duration}s"

    # Phase 7: Seed database with test users and resources
    phase_start=$(date +%s)
    log_info "Phase 7: Database seeding"
    if ! hub_seed 5000; then
        log_error "Database seeding failed"
        log_warn "Hub infrastructure deployed but requires manual seeding"
        log_warn "Run: ./dive hub seed"
        # Don't fail deployment - seeding can be done manually
    fi
    phase_end=$(date +%s)
    local phase7_duration=$((phase_end - phase_start))
    phase_times+=("Phase 7 (Seeding): ${phase7_duration}s")
    log_verbose "Phase 7 completed in ${phase7_duration}s"

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    # Record metrics
    if type metrics_record_deployment_duration &>/dev/null; then
        metrics_record_deployment_duration "HUB" "hub" "full" "$duration"
    fi

    # Display performance summary
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Deployment Performance Summary"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    for timing in "${phase_times[@]}"; do
        echo "  $timing"
    done
    echo "  ──────────────────────────────────────────────────"
    echo "  Total Duration: ${duration}s"

    # Performance analysis
    if [ $duration -lt 180 ]; then
        echo "  Performance: ✅ EXCELLENT (< 3 minutes)"
    elif [ $duration -lt 300 ]; then
        echo "  Performance: ⚠️  ACCEPTABLE (3-5 minutes)"
    else
        echo "  Performance: ❌ SLOW (> 5 minutes)"
        echo ""
        echo "  Performance issues detected. Slowest phases:"
        # Sort and show top 3 slowest phases
        printf '%s\n' "${phase_times[@]}" | sort -t: -k2 -nr | head -3 | while read -r line; do
            echo "    • $line"
        done
    fi
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    log_success "Hub deployment complete in ${duration}s"

    # Show access info
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Hub is ready!"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Keycloak:  https://localhost:8443"
    echo "  Backend:   http://localhost:4000"
    echo "  Frontend:  http://localhost:3000"
    echo ""
    echo "Next steps:"
    echo "  ./dive spoke deploy ALB    # Deploy Albania spoke"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    return 0
}

##
# Hub preflight checks
##
hub_preflight() {
    log_verbose "Running hub preflight checks..."

    # Check Docker
    if ! docker info >/dev/null 2>&1; then
        log_error "Docker is not running"
        return 1
    fi

    # Check Docker Compose
    if ! docker compose version >/dev/null 2>&1; then
        log_error "Docker Compose v2 not available"
        return 1
    fi

    # Check compose file exists
    if [ ! -f "$HUB_COMPOSE_FILE" ]; then
        log_error "Hub compose file not found: $HUB_COMPOSE_FILE"
        return 1
    fi

    # CRITICAL FIX: Create dive-shared network BEFORE docker-compose validates it
    # docker-compose.hub.yml declares dive-shared as "external: true"
    # This means Docker expects it to already exist at parse time (not runtime)
    # Without this, you get: "network dive-shared declared as external, but could not be found"
    log_verbose "Ensuring dive-shared network exists (required by docker-compose.hub.yml)..."
    if ! docker network inspect dive-shared >/dev/null 2>&1; then
        docker network create dive-shared || {
            log_error "Failed to create dive-shared network"
            return 1
        }
        log_verbose "Created dive-shared network"
    else
        log_verbose "dive-shared network already exists"
    fi

    # Check ports
    local ports_to_check="8443 4000 3000 5432 27017"
    for port in $ports_to_check; do
        if lsof -i ":$port" >/dev/null 2>&1; then
            log_warn "Port $port may be in use"
        fi
    done

    log_success "Preflight checks passed"
    return 0
}

##
# Initialize hub data directories and config
##
hub_init() {
    log_verbose "Initializing hub..."

    # Create data directories
    mkdir -p "${HUB_DATA_DIR}/config"
    mkdir -p "${DIVE_ROOT}/logs/hub"
    mkdir -p "${DIVE_ROOT}/instances/hub/certs"

    # Note: dive-shared network is created in hub_preflight() 
    # (must exist before docker-compose validates external networks)

    # Generate certificates if not exists
    local cert_dir="${DIVE_ROOT}/instances/hub/certs"
    if [ ! -f "${cert_dir}/certificate.pem" ]; then
        log_verbose "Generating hub certificates..."
        if command -v mkcert >/dev/null 2>&1; then
            cd "$cert_dir"
            mkcert -cert-file certificate.pem -key-file key.pem \
                localhost "*.localhost" hub.dive.local keycloak >/dev/null 2>&1
            cp "$(mkcert -CAROOT)/rootCA.pem" mkcert-rootCA.pem 2>/dev/null || true
            cd - >/dev/null
            log_verbose "Certificates generated with mkcert"
        else
            # Fallback to openssl
            openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
                -keyout "${cert_dir}/key.pem" \
                -out "${cert_dir}/certificate.pem" \
                -subj "/CN=localhost" >/dev/null 2>&1
            cp "${cert_dir}/certificate.pem" "${cert_dir}/mkcert-rootCA.pem"
            log_verbose "Certificates generated with openssl"
        fi
    fi

    # Initialize hub config if not exists
    if [ ! -f "${HUB_DATA_DIR}/config/hub.json" ]; then
        cat > "${HUB_DATA_DIR}/config/hub.json" << 'EOF'
{
  "hub_id": "dive-hub",
  "realm": "dive-v3-broker",
  "created": "2026-01-22",
  "spokes": []
}
EOF
    fi

    log_success "Hub initialization complete"
    return 0
}

##
# Start hub services with parallel startup optimization (Phase 2 Enhancement)
##
hub_up() {
    log_info "Starting hub services..."

    cd "$DIVE_ROOT"

    if [ "$DRY_RUN" = "true" ]; then
        log_info "[DRY RUN] Would run: docker compose -f $HUB_COMPOSE_FILE up -d"
        return 0
    fi

    # CRITICAL: Ensure dive-shared network exists (required by docker-compose.hub.yml)
    # This is normally done in hub_preflight(), but hub_up() can be called standalone
    # docker-compose.hub.yml declares dive-shared as "external: true" which is validated at parse time
    if ! docker network inspect dive-shared >/dev/null 2>&1; then
        log_verbose "Creating dive-shared network (required for hub services)..."
        if ! docker network create dive-shared 2>/dev/null; then
            log_error "Failed to create dive-shared network"
            log_error "This network is required by docker-compose.hub.yml (external: true)"
            return 1
        fi
        log_verbose "dive-shared network created"
    fi

    # CRITICAL: Load secrets from GCP or local before starting containers
    # This ensures all environment variables are available for docker-compose interpolation
    if ! load_secrets; then
        log_error "Failed to load secrets - cannot start hub"
        return 1
    fi

    # Phase 2 Enhancement: Check if parallel startup is enabled
    local use_parallel="${PARALLEL_STARTUP_ENABLED:-true}"

    if [ "$use_parallel" = "true" ] && type orch_parallel_startup &>/dev/null; then
        log_info "Using parallel service startup (dependency-aware)"

        # Start docker compose in detached mode (containers will be created but may not be fully started)
        docker compose -f "$HUB_COMPOSE_FILE" up -d --no-recreate 2>/dev/null || \
        docker compose -f "$HUB_COMPOSE_FILE" up -d

        # Use orchestration framework for intelligent parallel startup and health checking
        # This respects service dependencies and starts services concurrently where possible
        if ! orch_parallel_startup "USA" "all"; then
            log_error "Parallel service startup failed"
            log_warn "Some services may not be healthy - check logs: ./dive logs"
            return 1
        fi

        log_success "Hub services started (parallel mode: $(orch_get_max_dependency_level) levels)"
    else
        # Fallback: Traditional sequential startup
        log_verbose "Using traditional sequential startup (PARALLEL_STARTUP_ENABLED=false)"
        docker compose -f "$HUB_COMPOSE_FILE" up -d

        log_success "Hub services started (sequential mode)"
    fi

    return 0
}

##
# Stop hub services
##
hub_down() {
    log_info "Stopping hub services..."

    cd "$DIVE_ROOT"

    # CRITICAL: Load secrets before running docker-compose down
    # Docker Compose needs variable interpolation even for shutdown
    if ! load_secrets 2>/dev/null; then
        log_warn "Could not load secrets - using cached .env.hub if available"
        # Try to source .env.hub as fallback (may exist from previous run)
        if [ -f "${DIVE_ROOT}/.env.hub" ]; then
            set -a
            source "${DIVE_ROOT}/.env.hub"
            set +a
        fi
    fi

    docker compose -f "$HUB_COMPOSE_FILE" down

    log_success "Hub services stopped"
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
            local status=$(docker inspect "$service" --format='{{.State.Health.Status}}' 2>/dev/null || echo "not_found")

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
        if docker exec dive-hub-postgres pg_isready -U postgres >/dev/null 2>&1; then
            break
        fi
        sleep 2
        ((elapsed += 2))
    done

    # Create orchestration database
    docker exec dive-hub-postgres psql -U postgres -c "CREATE DATABASE orchestration;" >/dev/null 2>&1 || true

    # Apply full orchestration schema from migration file (CRITICAL - includes state_transitions)
    if [ -f "${DIVE_ROOT}/scripts/migrations/001_orchestration_state_db.sql" ]; then
        log_verbose "Applying full orchestration schema..."

        if docker exec -i dive-hub-postgres psql -U postgres -d orchestration < "${DIVE_ROOT}/scripts/migrations/001_orchestration_state_db.sql" >/dev/null 2>&1; then
            log_verbose "✓ Orchestration schema applied"
        else
            log_error "CRITICAL: Orchestration schema migration FAILED"
            return 1
        fi

        # Verify all required tables exist
        local required_tables=("deployment_states" "state_transitions" "deployment_steps"
                               "deployment_locks" "circuit_breakers" "orchestration_errors"
                               "orchestration_metrics" "checkpoints")
        local missing_tables=0

        for table in "${required_tables[@]}"; do
            if ! docker exec dive-hub-postgres psql -U postgres -d orchestration -c "\d $table" >/dev/null 2>&1; then
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
        if docker exec dive-hub-keycloak curl -sfk https://localhost:9000/health/ready >/dev/null 2>&1; then
            kc_ready=true
            break
        # Fallback: check if master realm is accessible
        elif docker exec dive-hub-keycloak curl -sf http://localhost:8080/realms/master >/dev/null 2>&1; then
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

            # Initialize Terraform (only if not already initialized)
            if [ ! -d ".terraform" ]; then
                log_verbose "Initializing Terraform..."
                terraform init -upgrade >/dev/null 2>&1
            else
                log_verbose "Terraform already initialized"
            fi

            # Export Terraform variables
            export TF_VAR_keycloak_admin_password="${KC_ADMIN_PASSWORD:-${KEYCLOAK_ADMIN_PASSWORD_USA:-${KEYCLOAK_ADMIN_PASSWORD}}}"
            export TF_VAR_client_secret="${KEYCLOAK_CLIENT_SECRET}"
            export TF_VAR_test_user_password="${TEST_USER_PASSWORD:-${KC_ADMIN_PASSWORD}}"
            export TF_VAR_admin_user_password="${ADMIN_PASSWORD:-${KC_ADMIN_PASSWORD}}"
            export KEYCLOAK_USER="admin"
            export KEYCLOAK_PASSWORD="${KC_ADMIN_PASSWORD:-${KEYCLOAK_ADMIN_PASSWORD_USA}}"

            # Verify variables set
            if [ -z "$TF_VAR_keycloak_admin_password" ] || [ -z "$TF_VAR_client_secret" ]; then
                log_error "Required Terraform variables not set"
                return 1
            fi

            log_verbose "Terraform variables validated"

            # Apply with performance optimizations
            log_verbose "Applying Terraform configuration (optimized for performance)..."
            terraform apply \
                -auto-approve \
                -var-file="hub.tfvars" \
                -parallelism=20 \
                -compact-warnings \
                -no-color
        ) || {
            log_error "Terraform apply failed"
            return 1
        }
    fi

    log_success "Keycloak configuration complete"
    return 0
}

##
# Verify Keycloak realm exists
##
hub_verify_realm() {
    local realm="dive-v3-broker-usa"
    local keycloak_url="https://localhost:8443"
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
    docker ps --filter "name=dive-hub" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "  No containers running"

    echo ""
    echo "Health:"
    for container in dive-hub-postgres dive-hub-keycloak dive-hub-backend dive-hub-frontend; do
        local health=$(docker inspect "$container" --format='{{.State.Health.Status}}' 2>/dev/null || echo "not_found")
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
    docker volume rm dive-hub-postgres-data dive-hub-mongodb-data 2>/dev/null || true

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
        docker compose -f "$HUB_COMPOSE_FILE" logs -f "$service"
    else
        docker compose -f "$HUB_COMPOSE_FILE" logs -f
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
module_hub() {
    local action="${1:-help}"
    shift || true

    case "$action" in
        deploy)         hub_deploy "$@" ;;
        init)           hub_init "$@" ;;
        up|start)       hub_up "$@" ;;
        down|stop)      hub_down "$@" ;;
        reset)          hub_reset "$@" ;;
        status)         hub_status "$@" ;;
        verify)         hub_verify "$@" ;;
        logs)           hub_logs "$@" ;;
        seed)           hub_seed "$@" ;;
        spokes)
            local sub="${1:-list}"
            shift || true
            case "$sub" in
                list)    hub_spokes_list "$@" ;;
                *)       echo "Usage: ./dive hub spokes <list>" ;;
            esac
            ;;
        help|*)
            echo "Usage: ./dive hub <command>"
            echo ""
            echo "Commands:"
            echo "  deploy    Full hub deployment"
            echo "  up        Start hub services"
            echo "  down      Stop hub services"
            echo "  status    Show hub status"
            echo "  verify    Run deployment validation tests"
            echo "  reset     Reset hub to clean state"
            echo "  logs      View hub logs"
            echo "  seed      Seed database with test data"
            echo "  spokes    Manage registered spokes"
            ;;
    esac
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f hub_deploy
export -f hub_preflight
export -f hub_init
export -f hub_up
export -f hub_down
export -f hub_wait_healthy
export -f hub_configure_keycloak
export -f hub_verify_realm
export -f hub_verify
export -f hub_status
export -f hub_reset
export -f hub_logs
export -f hub_seed
export -f hub_spokes_list
export -f module_hub

log_verbose "Hub deployment module loaded (consolidated)"
