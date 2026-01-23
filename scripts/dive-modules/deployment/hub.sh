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

if [ -f "${MODULES_DIR}/orchestration/state.sh" ]; then
    source "${MODULES_DIR}/orchestration/state.sh"
elif [ -f "${MODULES_DIR}/orchestration-state-db.sh" ]; then
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

    # Initialize request context
    if type init_request_context &>/dev/null; then
        init_request_context "hub-deployment" "deploy"
    fi

    # Preflight checks
    log_info "Phase 1: Preflight checks"
    if ! hub_preflight; then
        log_error "Preflight checks failed"
        return 1
    fi

    # Initialize
    log_info "Phase 2: Initialization"
    if ! hub_init; then
        log_error "Initialization failed"
        return 1
    fi

    # Start services
    log_info "Phase 3: Starting services"
    if ! hub_up; then
        log_error "Service startup failed"
        return 1
    fi

    # Wait for healthy
    log_info "Phase 4: Health verification"
    if ! hub_wait_healthy; then
        log_error "Health verification failed"
        return 1
    fi

    # Initialize orchestration database
    log_info "Phase 4b: Orchestration database"
    hub_init_orchestration_db

    # Configure Keycloak
    log_info "Phase 5: Keycloak configuration"
    if ! hub_configure_keycloak; then
        log_error "CRITICAL: Keycloak configuration FAILED"
        log_error "Hub is unusable without realm configuration"
        log_error "Fix Keycloak issues and redeploy"
        return 1
    fi

    # Verify realm exists after configuration
    log_info "Phase 5.5: Verifying realm creation"
    if ! hub_verify_realm; then
        log_error "CRITICAL: Realm verification FAILED"  
        log_error "Keycloak configuration completed but realm doesn't exist"
        log_error "This indicates Terraform or Keycloak state issues"
        return 1
    fi

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    # Record metrics
    if type metrics_record_deployment_duration &>/dev/null; then
        metrics_record_deployment_duration "HUB" "hub" "full" "$duration"
    fi

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

    # Create shared network
    docker network create dive-shared 2>/dev/null || true

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
# Start hub services
##
hub_up() {
    log_info "Starting hub services..."

    cd "$DIVE_ROOT"

    if [ "$DRY_RUN" = "true" ]; then
        log_info "[DRY RUN] Would run: docker compose -f $HUB_COMPOSE_FILE up -d"
        return 0
    fi

    # Source environment file for variable interpolation
    if [ -f "${DIVE_ROOT}/.env.hub" ]; then
        log_verbose "Loading secrets from .env.hub"
        set -a
        source "${DIVE_ROOT}/.env.hub"
        set +a
    else
        log_warn "No .env.hub file found - secrets may be missing"
    fi

    docker compose -f "$HUB_COMPOSE_FILE" up -d

    log_success "Hub services started"
    return 0
}

##
# Stop hub services
##
hub_down() {
    log_info "Stopping hub services..."

    cd "$DIVE_ROOT"
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

    # Create schema
    docker exec dive-hub-postgres psql -U postgres -d orchestration -c "
CREATE TABLE IF NOT EXISTS deployment_states (
    id SERIAL PRIMARY KEY,
    instance_code VARCHAR(10) NOT NULL,
    state VARCHAR(20) NOT NULL,
    message TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS deployment_locks (
    id SERIAL PRIMARY KEY,
    instance_code VARCHAR(10) NOT NULL,
    lock_id BIGINT NOT NULL,
    acquired_by VARCHAR(100),
    acquired_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    released_at TIMESTAMP
);
CREATE TABLE IF NOT EXISTS orchestration_errors (
    id SERIAL PRIMARY KEY,
    instance_code VARCHAR(10),
    error_code VARCHAR(50),
    error_message TEXT,
    component VARCHAR(50),
    recoverable BOOLEAN DEFAULT FALSE,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS circuit_breakers (
    id SERIAL PRIMARY KEY,
    operation_name VARCHAR(100) NOT NULL UNIQUE,
    state VARCHAR(20) DEFAULT 'CLOSED',
    failure_count INTEGER DEFAULT 0,
    last_failure TIMESTAMP,
    last_success TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS orchestration_metrics (
    id SERIAL PRIMARY KEY,
    instance_code VARCHAR(10),
    metric_name VARCHAR(100),
    metric_value FLOAT,
    labels JSONB,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
    " >/dev/null 2>&1

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
        cd "${DIVE_ROOT}/terraform/hub"
        terraform init -upgrade >/dev/null 2>&1
        terraform apply -auto-approve -var-file="hub.tfvars" >/dev/null 2>&1 || {
            log_warn "Terraform apply failed - manual configuration may be needed"
            return 1
        }
        cd - >/dev/null
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
##
hub_seed() {
    local count="${1:-100}"

    log_info "Seeding hub database with $count test resources..."

    # Run backend seeder
    docker exec dive-hub-backend npm run seed -- --count "$count" 2>/dev/null || {
        log_warn "Seeder not available - using direct insert"
    }

    log_success "Hub seeding complete"
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
export -f hub_status
export -f hub_reset
export -f hub_logs
export -f hub_seed
export -f hub_spokes_list
export -f module_hub

log_verbose "Hub deployment module loaded (consolidated)"
