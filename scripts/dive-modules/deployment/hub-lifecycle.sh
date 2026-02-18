#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Hub Lifecycle Operations
# =============================================================================
# Hub preflight, initialization, startup, shutdown, and resilience helpers.
# Sourced by deployment/hub-pipeline.sh.
# =============================================================================

# Prevent multiple sourcing
[ -n "${DIVE_HUB_LIFECYCLE_LOADED:-}" ] && return 0
export DIVE_HUB_LIFECYCLE_LOADED=1


##
# Hub preflight checks
##
hub_preflight() {
    log_verbose "Running hub preflight checks..."

    # Detect stale instances/usa/.env (passwords from a previous deploy cycle)
    if [ -f "${DIVE_ROOT}/instances/usa/.env" ] && [ -f "${DIVE_ROOT}/.env.hub" ]; then
        local env_hub_pw usa_env_pw
        env_hub_pw=$(grep "^KEYCLOAK_ADMIN_PASSWORD_USA=" "${DIVE_ROOT}/.env.hub" 2>/dev/null | cut -d= -f2-)
        usa_env_pw=$(grep "^KEYCLOAK_ADMIN_PASSWORD_USA=" "${DIVE_ROOT}/instances/usa/.env" 2>/dev/null | cut -d= -f2-)
        if [ -n "$env_hub_pw" ] && [ -n "$usa_env_pw" ] && [ "$env_hub_pw" != "$usa_env_pw" ]; then
            log_warn "instances/usa/.env has stale secrets — removing (will be regenerated)"
            rm -f "${DIVE_ROOT}/instances/usa/.env"
        fi
    fi

    # Use detected Docker command from common.sh
    local docker_cmd="${DOCKER_CMD:-docker}"

    # Check Docker daemon is running
    # Simple check: if docker ps works, Docker is ready
    if ! $docker_cmd ps >/dev/null 2>&1; then
        log_error "Docker daemon is not accessible"
        log_error "Docker command tried: $docker_cmd"
        log_error "Verify Docker Desktop is running and try again"
        return 1
    fi

    log_verbose "Docker daemon is accessible"

    # Check Docker Compose
    if ! $docker_cmd compose version >/dev/null 2>&1; then
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
    if ! $docker_cmd network inspect dive-shared >/dev/null 2>&1; then
        $docker_cmd network create dive-shared || {
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
    mkdir -p "${DIVE_ROOT}/instances/hub"

    # Note: dive-shared network is created in hub_preflight()
    # (must exist before docker-compose validates external networks)

    # Generate MongoDB keyfile if not exists
    # CRITICAL: Required for MongoDB replica set internal authentication
    local keyfile_path="${DIVE_ROOT}/instances/hub/mongo-keyfile"
    if [ ! -f "$keyfile_path" ]; then
        log_verbose "Generating MongoDB replica set keyfile..."

        # Use the standard keyfile generation script
        if [ -f "${DIVE_ROOT}/scripts/generate-mongo-keyfile.sh" ]; then
            if bash "${DIVE_ROOT}/scripts/generate-mongo-keyfile.sh" "$keyfile_path" >/dev/null 2>&1; then
                log_verbose "MongoDB keyfile generated: $keyfile_path"
            else
                log_error "Failed to generate MongoDB keyfile using script"
                return 1
            fi
        else
            # Fallback: Generate keyfile directly
            log_verbose "Generating MongoDB keyfile directly (script not found)"
            openssl rand -base64 756 | tr -d '\n' > "$keyfile_path"
            chmod 400 "$keyfile_path"

            # Verify file size (MongoDB requires 6-1024 characters)
            local file_size=$(wc -c < "$keyfile_path" | tr -d ' ')
            if [ "$file_size" -lt 6 ] || [ "$file_size" -gt 1024 ]; then
                log_error "KeyFile size ($file_size bytes) outside valid range (6-1024)"
                rm -f "$keyfile_path"
                return 1
            fi
            log_verbose "MongoDB keyfile generated directly: $keyfile_path ($file_size bytes)"
        fi
    else
        log_verbose "MongoDB keyfile already exists: $keyfile_path"

        # Verify it's a file (not a directory)
        if [ -d "$keyfile_path" ]; then
            log_error "MongoDB keyfile is a directory (should be a file): $keyfile_path"
            log_info "Removing directory and regenerating..."
            rm -rf "$keyfile_path"

            # Regenerate
            if [ -f "${DIVE_ROOT}/scripts/generate-mongo-keyfile.sh" ]; then
                bash "${DIVE_ROOT}/scripts/generate-mongo-keyfile.sh" "$keyfile_path" >/dev/null 2>&1
            else
                openssl rand -base64 756 | tr -d '\n' > "$keyfile_path"
                chmod 400 "$keyfile_path"
            fi
        fi
    fi

    # Generate certificates if not exists
    local cert_dir="${DIVE_ROOT}/instances/hub/certs"

    if [ ! -f "${cert_dir}/certificate.pem" ]; then
        if use_vault_pki 2>/dev/null && type generate_hub_certificate_vault &>/dev/null; then
            log_verbose "Generating hub certificates from Vault PKI..."
            generate_hub_certificate_vault
        elif command -v mkcert >/dev/null 2>&1; then
            log_verbose "Generating hub certificates with mkcert..."
            cd "$cert_dir"
            mkcert -cert-file certificate.pem -key-file key.pem \
                localhost "*.localhost" 127.0.0.1 \
                hub.dive.local \
                backend keycloak opa mongodb postgres redis kas opal-server frontend \
                >/dev/null 2>&1
            cp "$(mkcert -CAROOT)/rootCA.pem" mkcert-rootCA.pem 2>/dev/null || true
            cd - >/dev/null
            log_verbose "Certificates generated with mkcert (includes all Docker service names)"
        else
            # Fallback to openssl
            log_verbose "Generating hub certificates with openssl..."
            openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
                -keyout "${cert_dir}/key.pem" \
                -out "${cert_dir}/certificate.pem" \
                -subj "/CN=localhost" >/dev/null 2>&1
            cp "${cert_dir}/certificate.pem" "${cert_dir}/mkcert-rootCA.pem"
            log_verbose "Certificates generated with openssl"
        fi

        # Fix permissions for Docker containers (non-root users need read access)
        chmod 644 "${cert_dir}/key.pem" 2>/dev/null || true
    fi

    # Build SSOT CA bundle for docker-compose volume mounts
    # Services mount: ./certs/ca-bundle:/app/certs/ca:ro → NODE_EXTRA_CA_CERTS=/app/certs/ca/rootCA.pem
    # The bundle includes ALL trusted CAs so both hub (Vault PKI) and spoke (mkcert) services work.
    _rebuild_ca_bundle
    log_verbose "CA bundle built at ${DIVE_ROOT}/certs/ca-bundle/rootCA.pem"

    # Initialize hub config if not exists
    if [ ! -f "${HUB_DATA_DIR}/config/hub.json" ]; then
        cat > "${HUB_DATA_DIR}/config/hub.json" << 'EOF'
{
  "hub_id": "dive-hub",
  "realm": "dive-v3-broker-usa",
  "created": "2026-01-22",
  "spokes": []
}
EOF
    fi

    log_success "Hub initialization complete"
    return 0
}

##
# Start hub services with parallel startup optimization (Phase 3 Sprint 1)
##
hub_up() {
    echo "DEBUG [hub_up]: ENTRY" >&2
    log_info "Starting hub services..."

    cd "$DIVE_ROOT"

    if [ "$DRY_RUN" = "true" ]; then
        log_info "[DRY RUN] Would run: ${DOCKER_CMD:-docker} compose $HUB_COMPOSE_FILES up -d"
        return 0
    fi

    # CRITICAL: Ensure dive-shared network exists (required by docker-compose.hub.yml)
    # This is normally done in hub_preflight(), but hub_up() can be called standalone
    # docker-compose.hub.yml declares dive-shared as "external: true" which is validated at parse time
    echo "DEBUG [hub_up]: Checking dive-shared network..." >&2
    if ! ${DOCKER_CMD:-docker} network inspect dive-shared >/dev/null 2>&1; then
        log_verbose "Creating dive-shared network (required for hub services)..."
        if ! ${DOCKER_CMD:-docker} network create dive-shared 2>/dev/null; then
            log_error "Failed to create dive-shared network"
            log_error "This network is required by docker-compose.hub.yml (external: true)"
            return 1
        fi
        log_verbose "dive-shared network created"
    fi
    echo "DEBUG [hub_up]: dive-shared network OK" >&2

    # CRITICAL: Load secrets from GCP or local before starting containers
    # This ensures all environment variables are available for docker-compose interpolation
    echo "DEBUG [hub_up]: Loading secrets..." >&2
    if ! load_secrets; then
        log_error "Failed to load secrets - cannot start hub"
        return 1
    fi
    echo "DEBUG [hub_up]: Secrets loaded" >&2

    # CRITICAL: Pre-build all Docker images before parallel startup
    # This prevents build delays during service health checks (frontend, backend, etc.)
    echo "DEBUG [hub_up]: Building Docker images..." >&2
    log_info "Building Docker images (if needed)..."
    local build_log="/tmp/hub-docker-build-$(date +%s).log"
    if ${DOCKER_CMD:-docker} compose $HUB_COMPOSE_FILES --profile "$(_vault_get_profile)" build > "$build_log" 2>&1; then
        log_success "Docker images built successfully"
        echo "DEBUG [hub_up]: Docker images built" >&2
    else
        log_error "Failed to build Docker images"
        log_error "Build log: $build_log"
        tail -50 "$build_log" >&2
        return 1
    fi

    # Phase 3 Sprint 1: Enhanced parallel startup with dependency-aware orchestration
    local use_parallel="${PARALLEL_STARTUP_ENABLED:-true}"

    if [ "$use_parallel" = "true" ] && type hub_parallel_startup &>/dev/null; then
        log_info "Using parallel service startup (dependency-aware)"

        # Call hub-specific parallel startup function
        if ! hub_parallel_startup; then
            log_error "Parallel service startup failed"
            log_warn "Some services may not be healthy - check logs: ./dive logs"
            return 1
        fi

        log_success "Hub services started (parallel mode: 4 dependency levels)"

        # CRITICAL: Initialize MongoDB replica set after MongoDB container is healthy
        # This must be done for quick-start (hub up) mode as well
        # Backend and OPAL require MongoDB replica set for change streams

        # Guard: Skip if already initialized in Phase 5 (hub deploy)
        if [ "${HUB_MONGODB_RS_INITIALIZED:-false}" = "true" ]; then
            log_verbose "MongoDB replica set already initialized in Phase 5, skipping"
        else
            log_step "Initializing MongoDB replica set..."

            # Wait for MongoDB to be healthy first
        local mongo_wait=0
        local mongo_max_wait=30
        while [ $mongo_wait -lt $mongo_max_wait ]; do
            if docker ps --filter "name=dive-hub-mongodb" --filter "health=healthy" --format "{{.Names}}" | grep -q "dive-hub-mongodb"; then
                log_verbose "MongoDB container is healthy"
                break
            fi
            sleep 2
            mongo_wait=$((mongo_wait + 2))
        done

        if [ $mongo_wait -ge $mongo_max_wait ]; then
            log_error "MongoDB container not healthy after ${mongo_max_wait}s"
            return 1
        fi

        # Check if replica set is already initialized
        local is_initialized=false
        if docker exec dive-hub-mongodb mongosh admin -u admin -p "$MONGO_PASSWORD" --tls --tlsAllowInvalidCertificates --quiet --eval 'rs.status().myState' 2>/dev/null | grep -q "^1$"; then
            log_verbose "MongoDB replica set already initialized and PRIMARY"
            is_initialized=true
        fi

        # Initialize if not already initialized
        if [ "$is_initialized" = "false" ]; then
            log_verbose "Initializing MongoDB replica set..."

            if [ ! -f "${DIVE_ROOT}/scripts/init-mongo-replica-set-post-start.sh" ]; then
                log_error "MongoDB initialization script not found"
                return 1
            fi

            if ! bash "${DIVE_ROOT}/scripts/init-mongo-replica-set-post-start.sh" dive-hub-mongodb admin "$MONGO_PASSWORD"; then
                log_error "MongoDB replica set initialization FAILED"
                log_error "This will cause 'not primary' errors and backend startup failure"
                return 1
            fi

            log_success "MongoDB replica set initialized and PRIMARY"

            # CRITICAL: Restart backend so it reconnects with new PRIMARY state
            log_verbose "Restarting backend to reconnect to PRIMARY MongoDB..."
            if docker ps --filter "name=dive-hub-backend" --format "{{.Names}}" | grep -q "dive-hub-backend"; then
                docker restart dive-hub-backend >/dev/null 2>&1

                # Wait for backend to be healthy again
                local backend_wait=0
                while [ $backend_wait -lt 30 ]; do
                    if docker ps --filter "name=dive-hub-backend" --filter "health=healthy" --format "{{.Names}}" | grep -q "dive-hub-backend"; then
                        log_success "Backend reconnected to MongoDB PRIMARY"
                        break
                    fi
                    sleep 2
                    backend_wait=$((backend_wait + 2))
                done
            fi
        fi
        fi  # End HUB_MONGODB_RS_INITIALIZED guard
    else
        # Fallback: Traditional sequential startup
        log_verbose "Using traditional sequential startup (PARALLEL_STARTUP_ENABLED=false)"
        ${DOCKER_CMD:-docker} compose $HUB_COMPOSE_FILES --profile "$(_vault_get_profile)" up -d

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

    ${DOCKER_CMD:-docker} compose $HUB_COMPOSE_FILES --profile "$(_vault_get_profile)" down

    log_success "Hub services stopped"
    return 0
}

##
# Calculate dependency level for a service (helper function)
# Level 0 = no dependencies
# Level N = max(dependency levels) + 1
#
# Arguments:
#   $1 - Service name
#
# Returns:
#   Dependency level (0-based integer)
##
calculate_service_level() {
    local service="$1"
    local visited_path="${2:-}"  # For cycle detection

    # Cycle detection
    if [[ " $visited_path " =~ " $service " ]]; then
        log_warn "Circular dependency detected: $visited_path -> $service"
        echo "0"
        return
    fi

    # Get dependencies for this service
    local deps="${service_deps[$service]}"

    # No dependencies = level 0
    if [ "$deps" = "none" ] || [ -z "$deps" ]; then
        echo "0"
        return
    fi

    # Calculate max level of dependencies
    local max_dep_level=0
    for dep in $deps; do
        # Skip if dependency doesn't exist in our service list
        if [ -z "${service_deps[$dep]+x}" ]; then
            continue
        fi

        local dep_level=$(calculate_service_level "$dep" "$visited_path $service")
        if [ $dep_level -gt $max_dep_level ]; then
            max_dep_level=$dep_level
        fi
    done

    # This service's level = max dependency level + 1
    echo $((max_dep_level + 1))
}

##
# Retry with exponential backoff (Phase 4 Sprint 2)
# Handles transient failures with configurable retry attempts
#
# Arguments:
#   $1 - Max retry attempts (default: 3)
#   $2 - Service name (for logging)
#   $3+ - Command to execute
#
# Returns:
#   0 on success, 1 on final failure
#
# Environment Variables:
#   RETRY_MAX_ATTEMPTS - Override default retry attempts (default: 3)
#   RETRY_BASE_DELAY - Base delay in seconds (default: 2)
#   RETRY_MAX_DELAY - Maximum delay in seconds (default: 30)
##
retry_with_backoff() {
    local max_attempts="${RETRY_MAX_ATTEMPTS:-3}"
    local service_name="$1"
    shift

    local attempt=1
    local delay="${RETRY_BASE_DELAY:-2}"
    local max_delay="${RETRY_MAX_DELAY:-30}"

    while [ $attempt -le $max_attempts ]; do
        # Execute command
        if "$@"; then
            if [ $attempt -gt 1 ]; then
                log_success "$service_name: Recovered after $attempt attempts"
            fi
            return 0
        fi

        # Check if we should retry
        if [ $attempt -lt $max_attempts ]; then
            log_warn "$service_name: Attempt $attempt/$max_attempts failed, retrying in ${delay}s..."
            sleep "$delay"

            # Exponential backoff: delay = delay * 2, capped at max_delay
            delay=$((delay * 2))
            if [ $delay -gt $max_delay ]; then
                delay=$max_delay
            fi
        else
            log_error "$service_name: All $max_attempts attempts failed"
        fi

        ((attempt++))
    done

    return 1
}

##
# Circuit breaker for repeated failures (Phase 4 Sprint 2)
# Prevents infinite retry loops by failing fast after threshold
#
# Arguments:
#   $1 - Service name
#   $2 - Failure type (e.g., "health_check", "startup")
#
# Returns:
#   0 if circuit is closed (can proceed)
#   1 if circuit is open (fail fast)
#
# Environment Variables:
#   CIRCUIT_BREAKER_THRESHOLD - Failures before opening (default: 3)
#   CIRCUIT_BREAKER_TIMEOUT - Reset timeout in seconds (default: 60)
##
declare -A CIRCUIT_BREAKER_FAILURES
declare -A CIRCUIT_BREAKER_LAST_FAILURE

circuit_breaker_check() {
    local service="$1"
    local failure_type="$2"
    local key="${service}:${failure_type}"

    local threshold="${CIRCUIT_BREAKER_THRESHOLD:-3}"
    local timeout="${CIRCUIT_BREAKER_TIMEOUT:-60}"
    local now=$(date +%s)

    # Check if circuit was opened recently
    local last_failure="${CIRCUIT_BREAKER_LAST_FAILURE[$key]:-0}"
    local time_since_failure=$((now - last_failure))

    # Reset circuit if timeout expired
    if [ "$time_since_failure" -gt "$timeout" ]; then
        CIRCUIT_BREAKER_FAILURES[$key]=0
        CIRCUIT_BREAKER_LAST_FAILURE[$key]=0
    fi

    # Check failure count
    local failures="${CIRCUIT_BREAKER_FAILURES[$key]:-0}"
    if [ "$failures" -ge "$threshold" ]; then
        log_error "$service: Circuit breaker OPEN (${failures} consecutive failures)"
        log_error "$service: Failing fast to prevent cascading failures"
        return 1
    fi

    return 0
}

circuit_breaker_record_failure() {
    local service="$1"
    local failure_type="$2"
    local key="${service}:${failure_type}"

    local failures="${CIRCUIT_BREAKER_FAILURES[$key]:-0}"
    CIRCUIT_BREAKER_FAILURES[$key]=$((failures + 1))
    CIRCUIT_BREAKER_LAST_FAILURE[$key]=$(date +%s)
}

circuit_breaker_reset() {
    local service="$1"
    local failure_type="$2"
    local key="${service}:${failure_type}"

    CIRCUIT_BREAKER_FAILURES[$key]=0
    CIRCUIT_BREAKER_LAST_FAILURE[$key]=0
}

##
# Hub-specific parallel startup using dependency graph
# Phase 3 Sprint 1: Enables 40-50% faster startup through parallel service orchestration
# Phase 2 Part 3: Dynamic dependency level calculation
# Phase 4 Sprint 2: Added retry logic and graceful degradation
##
